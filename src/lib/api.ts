/** A failed call to the Flask app. `body` keeps whatever else the server said. */
export class ApiError extends Error {
	status: number;
	body: Record<string, any>;
	constructor(message: string, status: number, body: Record<string, any>) {
		super(message);
		this.status = status;
		this.body = body;
	}
}

/** Fetch JSON from the Flask app. Throws an ApiError carrying the server's own message. */
export async function api<T = any>(url: string, options: RequestInit = {}): Promise<T> {
	const response = await fetch(url, { credentials: 'same-origin', ...options });
	const body = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new ApiError(body.error || 'Something went wrong.', response.status, body);
	}
	return body as T;
}

/** A JSON request. The server only accepts JSON for forms, which keeps other sites from posting to it. */
export const json = (method: string, body: unknown = {}): RequestInit => ({
	method,
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(body)
});
