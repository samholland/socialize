export type MediaAspect = "1:1" | "3:4" | "9:16";

export type PreviewMedia =
  | { kind: "none" }
  | { kind: "image"; url: string }
  | { kind: "video"; url: string };

export type Rect = { x: number; y: number; w: number; h: number };

export type Layout = {
  frame: Rect;
  screen: Rect;
  screenRadius: number;
  scale: number;
};

