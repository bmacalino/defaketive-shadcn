<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import CircleHelpIcon from '@lucide/svelte/icons/circle-help';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import HistoryIcon from '@lucide/svelte/icons/history';
	import HouseIcon from '@lucide/svelte/icons/house';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LogInIcon from '@lucide/svelte/icons/log-in';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import PackageSearchIcon from '@lucide/svelte/icons/package-search';
	import PuzzleIcon from '@lucide/svelte/icons/puzzle';
	import ScanSearchIcon from '@lucide/svelte/icons/scan-search';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import type { Component } from 'svelte';
	import { Avatar, AvatarFallback } from '#lib/components/ui/avatar/index.js';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '#lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { initials } from '#lib/product.js';
	import { agency } from '#lib/stores/agency.svelte.js';
	import { auth } from '#lib/stores/auth.svelte.js';
	import { signOut } from '#lib/session.js';
	import { ui } from '#lib/stores/ui.svelte.js';
	import Logo from './logo.svelte';

	type Item = { href: string; label: string; icon: Component };
	const check: Item[] = [
		{ href: '/app/home', label: 'Home', icon: HouseIcon },
		{ href: '/app/analyze', label: 'Check a product', icon: ScanSearchIcon },
		{ href: '/app/products', label: 'Products', icon: PackageSearchIcon }
	];
	const mine: Item[] = [
		{ href: '/app/history', label: 'History', icon: HistoryIcon },
		{ href: '/app/wishlist', label: 'Wishlist', icon: HeartIcon }
	];
	const learn: Item[] = [
		{ href: '/app/extension', label: 'Get the extension', icon: PuzzleIcon },
		{ href: '/app/about', label: 'About', icon: InfoIcon },
		{ href: '/app/faq', label: 'FAQ', icon: CircleHelpIcon }
	];

	const sidebar = Sidebar.useSidebar();

	const active = (href: string) => page.url.pathname === href;

</script>

{#snippet group(label: string, items: Item[])}
	<Sidebar.Group>
		<Sidebar.GroupLabel>{label}</Sidebar.GroupLabel>
		<Sidebar.GroupContent>
			<Sidebar.Menu>
				{#each items as item (item.href)}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton isActive={active(item.href)} tooltipContent={item.label}>
							{#snippet child({ props })}
								<a href={item.href} {...props} onclick={() => sidebar.isMobile && sidebar.setOpenMobile(false)}>
									<item.icon />
									<span>{item.label}</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				{/each}
			</Sidebar.Menu>
		</Sidebar.GroupContent>
	</Sidebar.Group>
{/snippet}

<Sidebar.Root collapsible="icon">
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<div class="flex h-10 items-center px-2">
					<Logo href="/app/home" showName={sidebar.state !== 'collapsed' || sidebar.isMobile} />
				</div>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		{#if agency.member}
			<!-- Only for accounts the team gave access to (scripts/agency_accounts.py); the server checks it again. -->
			<Sidebar.Group>
				<Sidebar.GroupLabel>Partner agency</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={page.url.pathname.startsWith('/app/agency')} tooltipContent={agency.title}>
								{#snippet child({ props })}
									<a href="/app/agency" {...props} onclick={() => sidebar.isMobile && sidebar.setOpenMobile(false)}>
										<ShieldCheckIcon />
										<span>{agency.title}</span>
										{#if agency.newCount.reports}<span class="sr-only">, {agency.newCount.reports} new</span>{/if}
									</a>
								{/snippet}
							</Sidebar.MenuButton>
							{#if agency.newCount.reports}
								<Sidebar.MenuBadge aria-hidden="true">{agency.newCount.reports}</Sidebar.MenuBadge>
							{/if}
						</Sidebar.MenuItem>
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{/if}
		{@render group('Main', check)}
		{@render group('Your library', mine)}
		{@render group('Learn', learn)}
	</Sidebar.Content>

	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				{#if auth.user}
					<DropdownMenu>
						<DropdownMenuTrigger>
							{#snippet child({ props })}
								<Sidebar.MenuButton size="lg" class="data-open:bg-sidebar-accent" {...props}>
									<Avatar class="size-8 rounded-lg">
										<AvatarFallback class="rounded-lg">{initials(auth.user?.name)}</AvatarFallback>
									</Avatar>
									<div class="grid flex-1 text-left text-sm leading-tight">
										<span class="truncate font-medium">{auth.user?.name}</span>
										<span class="text-muted-foreground truncate text-xs">{auth.user?.email}</span>
									</div>
									<ChevronsUpDownIcon class="ml-auto size-4" />
								</Sidebar.MenuButton>
							{/snippet}
						</DropdownMenuTrigger>
						<DropdownMenuContent side={sidebar.isMobile ? 'bottom' : 'right'} align="end" class="min-w-56">
							<DropdownMenuLabel class="text-muted-foreground text-xs font-normal">
								Your history and wishlist are saved to your account.
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem onclick={() => goto('/app/settings')}><SettingsIcon /> Settings</DropdownMenuItem>
							<DropdownMenuItem onclick={signOut}><LogOutIcon /> Sign out</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				{:else}
					<Sidebar.MenuButton size="lg" tooltipContent="Sign in" onclick={() => ui.openAuth('signin')}>
						<LogInIcon />
						<div class="grid flex-1 text-left text-sm leading-tight">
							<span class="font-medium">Sign in</span>
							<span class="text-muted-foreground text-xs">
								{auth.left > 0 ? `${auth.left} free scan${auth.left === 1 ? '' : 's'} left today` : 'No free scans left today'}
							</span>
						</div>
					</Sidebar.MenuButton>
				{/if}
			</Sidebar.MenuItem>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton isActive={active('/app/settings')} tooltipContent="Settings">
					{#snippet child({ props })}
						<a href="/app/settings" {...props}><SettingsIcon /><span>Settings</span></a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
