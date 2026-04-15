import { useState } from "react";
import "./App.css";
import Sidebar, { SidebarToggle, type AppView } from "./components/Sidebar";
import Header from "./components/Header";
import ChatArea from "./components/ChatArea";
import BrainView from "./components/BrainView";

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("chats");

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(true)}
        activeView={activeView}
        onViewChange={setActiveView}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        {sidebarCollapsed && (
          <SidebarToggle onClick={() => setSidebarCollapsed(false)} />
        )}
        {activeView === "chats" ? <ChatArea /> : <BrainView />}
      </div>
    </div>
  );
}

export default App;
