// MindustryText.tsx
import { useMemo } from "react";
import { parseMindustry, toCss } from "../util/mindustryText";

interface Props {
  text: string;
  watercolor?: boolean;
  strength?: number;
  dim?: number;
}

export function MindustryText({ text, watercolor = true, strength = 0.5, dim = 0.88 }: Props) {
  const nodes = useMemo(() => {
    const wc = watercolor ? { t: strength, dim } : null;
    return parseMindustry(text).map((seg, i) =>
      seg.color === null ? (
        seg.text
      ) : (
        <span key={i} style={{ color: toCss(seg.color, wc) }}>
          {seg.text}
        </span>
      )
    );
  }, [text, watercolor, strength, dim]);

  return <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{nodes}</span>;
}