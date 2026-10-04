/** First focusable element on every page; jumps past the navigation. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="fixed top-12 left-12 z-[100] -translate-y-[200%] rounded-pill bg-signal-orange px-24 py-12 font-clash text-body-sm font-medium tracking-clash text-abyss uppercase focus:translate-y-0"
    >
      Skip to content
    </a>
  );
}
