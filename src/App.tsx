import { useEffect, useRef } from "react";
import { startGame } from "./game/ui";

export default function App() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const dispose = startGame(ref.current);
    return () => dispose();
  }, []);
  return <div ref={ref} style={{ position: "fixed", inset: 0 }} />;
}
