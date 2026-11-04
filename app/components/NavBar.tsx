import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import AccountMenu from "./AccountMenu";

const navigationItems: { label: string; href: string; active: boolean }[] = [
	{ label: "Memes", href: "/captions", active: false },
	{ label: "favorites", href: "/favorite", active: false },
	// { label: "AI captions", href: "/captions", active: false },
	// // { label: "Top 100", href: "/", active: true },
	// { label: "Favorites", href: "/favorite", active: false },
	// // { label: "Images", href: "/images", active: false },
];


function BrandLink() {
	return (
		<Link href="/" aria-label="Humor Project home" className="flex items-center gap-3 text-[22px] font-extrabold tracking-[-1px] leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:text-[25px]">
			<span aria-hidden="true" className="relative flex h-10 w-10 rotate-[-8deg] items-center justify-center rounded-[13px] border-2 border-[var(--foreground)] bg-[var(--accent)] pr-1 text-[21px] tracking-[-3px]">
				h<span className="translate-y-[2px]">p</span>
				<i className="absolute bottom-1 left-3 h-[5px] w-[14px] rounded-[50%] border-b-2 border-[var(--foreground)]" />
			</span>
			<span>humorproject<span className="text-[var(--accent-strong)]">.</span></span>
		</Link>
	);
}

function SignedOutNavBar() {
	return (
		<header className="min-h-[85px] border-b border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] sm:min-h-[104px]">
			<div className="mx-auto flex min-h-[85px] w-full max-w-[1280px] items-center justify-between gap-5 px-5 sm:min-h-[104px] sm:px-[35px]">
				<BrandLink />
				<div className="flex items-center gap-3 sm:gap-8">
					<Link href="/captions" className="text-sm font-semibold transition-colors hover:text-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:text-base">Memes</Link>
					<Link href="/login" className="text-sm font-semibold transition-colors hover:text-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:text-base">
						Login
					</Link>
					<Link href="/signup" className="flex min-h-[42px] items-center rounded-[9px] bg-[var(--foreground)] px-5 text-sm font-bold text-[var(--background)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:min-h-[46px] sm:px-6 sm:text-base">
						Sign up
					</Link>
				</div>
			</div>
		</header>
	);
}

function SignedInNavBar({ name, email, isAdmin, adminUrl }: { name: string; email: string; isAdmin: boolean; adminUrl?: string }) {
	return (
		<header className="relative z-40 min-h-[85px] overflow-visible border-b border-[var(--border)] bg-[var(--background)] text-[var(--muted)] sm:min-h-[104px]">
			<div className="mx-auto flex min-h-[85px] max-w-[1280px] flex-wrap items-center justify-between gap-x-10 gap-y-3 overflow-visible px-5 py-4 sm:min-h-[104px] sm:flex-nowrap sm:px-[35px]">
				<div className="flex w-full shrink-0 items-center justify-between gap-8 sm:w-auto sm:justify-start sm:gap-[76px]">
					<BrandLink />

						{/* <Link href="/new" className="text-sm font-semibold transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:text-base">
						Generate a Caption
					</Link> */}
				</div>

				<div className="relative flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-5 lg:gap-7">
					<nav aria-label="Main navigation" className="flex min-w-0 items-center justify-between gap-4 whitespace-nowrap sm:gap-8">
						{navigationItems.map(({ label, href, active }) => (
							<Link
								key={label}
								href={href}
								aria-current={active ? "page" : undefined}
								className={`shrink-0 text-sm font-semibold transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:text-base ${active ? "text-[var(--accent-strong)]" : "text-[var(--muted)]"}`}
							>
								{label}
							</Link>
						))}
					</nav>
					<AccountMenu name={name} email={email} isAdmin={isAdmin} adminUrl={adminUrl} />
				</div>
			</div>
		</header>
	);
}

export default async function NavBar() {
	const cookieStore = await cookies();
	const supabase = createClient(cookieStore);
	const { data: { user } } = await supabase.auth.getUser();
	let isAdmin = false;
	let adminUrl: string | undefined;
	if (user) {
		const { data: profile, error } = await supabase
			.from("profiles")
			.select("role")
			.eq("user_id", user.id)
			.maybeSingle();

		if (error) {
			console.error("Account role load failed:", error.message);
		} else if (profile?.role === "admin") {
			isAdmin = true;
			if (process.env.NEXT_PUBLIC_ADMIN_PANEL_URL) {
				adminUrl = `${process.env.NEXT_PUBLIC_ADMIN_PANEL_URL.replace(/\/+$/, "")}/admin`;
			}
		}
	}

	const metadata = user?.user_metadata ?? {};
	const name = typeof metadata.full_name === "string"
		? metadata.full_name
		: typeof metadata.name === "string"
			? metadata.name
			: user?.email?.split("@")[0] ?? "Account";

	return user
		? <SignedInNavBar name={name} email={user.email ?? ""} isAdmin={isAdmin} adminUrl={adminUrl} />
		: <SignedOutNavBar />;
}
