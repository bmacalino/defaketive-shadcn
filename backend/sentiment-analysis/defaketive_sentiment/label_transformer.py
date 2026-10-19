"""The label transformer: a fine-tuned XLM-RoBERTa that may add poor quality,
not as advertised or possible fake to a sentence the rules did not flag.

Built by research/build_label_transformer_v1.py from the run of
research/train_label_transformer_v2.py chosen on training data only
(research/label_transformer_choice_v1.json), and judged once on held-out round
22 (research/PREREGISTRATION_round22.md). One model with five yes/no outputs;
only the labels named in its manifest's "thresholds" are ever added, each
above the threshold at which at least 80 in 100 of its additions were right
on the validation part.

Each sentence is scored on its own, as the sentiment model scores each review:
the int8 model quantizes activations with a scale computed over the whole
input, so in a batch a sentence's score would depend on its batch-mates.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np

FOLDER_NAME = "label_transformer_v1"
REQUIRED_FILES = ("model.onnx", "tokenizer.json")


class LabelTransformerError(RuntimeError):
    """The label transformer is missing, altered or not qualified."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


class LabelTransformer:
    """Scores one sentence at a time; `decide` returns the labels it adds."""

    def __init__(self, model_dir: str | Path, *, threads: int = 1):
        self.model_dir = Path(model_dir)
        manifest_path = self.model_dir / "manifest.json"
        if not manifest_path.is_file():
            raise LabelTransformerError(f"{manifest_path} is missing.")
        self.manifest: dict[str, Any] = json.loads(manifest_path.read_bytes().decode("utf-8"))
        recorded = self.manifest.get("files") or {}
        for name in REQUIRED_FILES:
            path = self.model_dir / name
            if not path.is_file() or recorded.get(name) != _sha256(path):
                raise LabelTransformerError(f"{path} is missing or is not the model that was measured.")
        if not self.manifest.get("qualified_for_integration"):
            raise LabelTransformerError(f"{self.model_dir} names no label to add.")
        import onnxruntime as ort
        from tokenizers import Tokenizer

        options = ort.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        options.enable_cpu_mem_arena = False
        options.enable_mem_pattern = False
        self.session = ort.InferenceSession(
            str(self.model_dir / "model.onnx"), options, providers=["CPUExecutionProvider"]
        )
        self.tokenizer = Tokenizer.from_file(str(self.model_dir / "tokenizer.json"))
        self.tokenizer.no_padding()
        self.tokenizer.enable_truncation(max_length=int(self.manifest.get("max_length") or 64))
        self.labels = [str(label) for label in self.manifest["labels"]]
        self.thresholds = {str(label): float(value) for label, value in (self.manifest.get("thresholds") or {}).items()}
        self.version = str(self.manifest["model_version"])

    def scores(self, text: str) -> dict[str, float]:
        """The model's probability for each of its five labels, for one sentence."""
        encoding = self.tokenizer.encode(str(text or "").strip())
        logits = self.session.run(
            ["logits"],
            {
                "input_ids": np.array([encoding.ids], dtype=np.int64),
                "attention_mask": np.array([encoding.attention_mask], dtype=np.int64),
            },
        )[0][0]
        values = 1.0 / (1.0 + np.exp(-logits.astype(np.float64)))
        return {label: float(value) for label, value in zip(self.labels, values)}

    def decide(self, text: str) -> dict[str, float]:
        """The labels this model adds to the sentence, with their probabilities."""
        found = self.scores(text)
        return {label: round(found[label], 4) for label, threshold in self.thresholds.items() if found[label] >= threshold}
