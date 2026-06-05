import { StatGrid } from "./StatGrid";
import { Gauge } from "./Gauge";
import { BigNumber } from "./BigNumber";
import { BadgeTable } from "./BadgeTable";
import { SignalBar } from "./SignalBar";
import { Comparison } from "./Comparison";
import { Timeline } from "./Timeline";
import { Progress } from "./Progress";
import { Callout } from "./Callout";
import { KVList } from "./KVList";
import { Scorecard } from "./Scorecard";

export interface VisualBlock {
  type: string;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderBlock(block: any, i: number) {
  switch (block.type) {
    case "stat-grid": return <StatGrid key={i} {...block} />;
    case "gauge": return <Gauge key={i} {...block} />;
    case "big-number": return <BigNumber key={i} {...block} />;
    case "badge-table": return <BadgeTable key={i} {...block} />;
    case "signal-bar": return <SignalBar key={i} {...block} />;
    case "comparison": return <Comparison key={i} {...block} />;
    case "timeline": return <Timeline key={i} {...block} />;
    case "progress": return <Progress key={i} {...block} />;
    case "callout": return <Callout key={i} {...block} />;
    case "kv-list": return <KVList key={i} {...block} />;
    case "scorecard": return <Scorecard key={i} {...block} />;
    default: return null;
  }
}

export function VisualBlockRenderer({ blocks }: { blocks: VisualBlock[] }) {
  if (!Array.isArray(blocks)) return null;

  return (
    <div className="vb-container flex flex-col gap-3 my-3">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}
