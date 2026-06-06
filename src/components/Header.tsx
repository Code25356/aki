import ModelSelector from "./ModelSelector";

export default function Header() {
  return (
    <header
      data-tauri-drag-region
      className="h-[var(--titlebar-height)] shrink-0 flex items-center justify-center
                 bg-[var(--color-header-bg)] backdrop-blur-xl
                 border-b border-[var(--color-sidebar-border)]
                 relative z-50 overflow-visible"
    >
      {/* Left: model selector — offset by traffic light width */}
      <div className="absolute left-0 top-0 h-full flex items-center"
           style={{ paddingLeft: "calc(var(--traffic-light-width) + 8px)" }}>
        <ModelSelector />
      </div>

      {/* Center: app name */}
      <span className="text-[13px] font-medium text-[var(--color-text-secondary)]">
        Aki
      </span>
    </header>
  );
}
