import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import type { Activity, EmployeeStatus, EmployeeView } from "./types";

const DESK_W = 130;
const DESK_H = 100;
const COLS_PER_ROW = 3;
const DEPT_PADDING = 18;
const DEPT_HEADER = 34;
const FLOOR_EXTRA = 90; // 徘徊できる床の余白
const MAP_COLS = 2;
const COL_WIDTH = 440;
const WALK_SPEED = 48; // px/sec

const STATUS_COLOR: Record<EmployeeStatus, number> = {
  "no-agent": 0xb2a48c,
  idle: 0x9cae87,
  working: 0x4e9a62,
  waiting: 0xe0a83c,
  done: 0x3e8e7e,
  error: 0xc85c4a,
};

const FUR_LIGHT = 0xfbf3e4;
const INK = 0x3d3226;

type Species = "cat" | "fox" | "bear" | "rabbit" | "dog";
const SPECIES_LIST: Species[] = ["cat", "fox", "bear", "rabbit", "dog"];

function speciesForId(id: string): Species {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return SPECIES_LIST[hash % SPECIES_LIST.length];
}

const ACTIVITY_EMOJI: Partial<Record<Activity, string>> = {
  starting: "🚪",
  thinking: "💭",
  typing: "⌨️",
  reading: "📖",
  running: "⚙️",
  researching: "🔍",
  waiting: "❗",
};

// working/waiting/error は自分のデスクに留まり続ける（作業の実体はそこにあるため）。
// それ以外は部署フロア内を自由に歩き回れる。
const DESK_BOUND_STATUSES = new Set<EmployeeStatus>(["working", "waiting", "error"]);

const CHATTER: Record<EmployeeStatus, string[]> = {
  "no-agent": ["今日は何しよう", "デスク片付けよ", "コーヒー飲も", "暇だな〜", "誰か話しかけて"],
  idle: ["ちょっと休憩", "伸びしたいな", "眠い…", "何か手伝おうか？", "次のタスク待ち"],
  working: [
    "この実装で合ってるかな",
    "レビューお願いします",
    "テスト通った！",
    "worktreeでビルド中",
    "あとちょっとで終わりそう",
    "コミットしなきゃ",
  ],
  waiting: ["承認待ちです…", "誰か見てー", "反応ないなあ", "止まっちゃった"],
  done: ["終わりました！", "お疲れさまでした", "次は何しよう", "コミット済みです"],
  error: ["あれ、エラーだ…", "ちょっと詰まってます", "うーん、直らない"],
};

const REPLIES = ["それな", "わかる〜", "なるほど", "確かに", "がんばって！", "了解です", "同じく"];

interface DeptBox {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  members: EmployeeView[];
}

function layoutDepartments(employees: EmployeeView[]): {
  boxes: DeptBox[];
  width: number;
  height: number;
} {
  const order: string[] = [];
  const byDept = new Map<string, EmployeeView[]>();
  for (const e of employees) {
    if (!byDept.has(e.department)) {
      byDept.set(e.department, []);
      order.push(e.department);
    }
    byDept.get(e.department)!.push(e);
  }

  const colY = [DEPT_PADDING, DEPT_PADDING];
  const boxes: DeptBox[] = [];

  order.forEach((name, i) => {
    const members = byDept.get(name)!;
    const rows = Math.ceil(members.length / COLS_PER_ROW);
    const h = DEPT_HEADER + rows * DESK_H + FLOOR_EXTRA + DEPT_PADDING;
    const col = i % MAP_COLS;
    const x = DEPT_PADDING + col * (COL_WIDTH + DEPT_PADDING);
    const y = colY[col];
    boxes.push({ name, x, y, w: COL_WIDTH, h, members });
    colY[col] += h + DEPT_PADDING;
  });

  const width = DEPT_PADDING * 3 + COL_WIDTH * MAP_COLS;
  const height = Math.max(...colY, 200);
  return { boxes, width, height };
}

function drawAnimal(g: PIXI.Graphics, color: number, species: Species) {
  g.clear();

  // しっぽ（種類ごとに形が違う）
  if (species === "rabbit") {
    g.circle(11, 17, 5).fill({ color: FUR_LIGHT });
  } else if (species === "dog") {
    g.ellipse(12, 15, 4, 7).fill({ color });
  } else if (species === "bear") {
    g.circle(10, 19, 4).fill({ color });
  } else {
    // cat / fox: 細くカーブしたしっぽ
    g.moveTo(9, 18).quadraticCurveTo(20, 14, 15, 2).stroke({ color, width: 4, cap: "round" });
  }

  // 耳（種類ごとの形。頭より先に描いて頭の輪郭の後ろから覗かせる）
  if (species === "cat") {
    g.poly([-9, -14, -4, -25, 1, -15]).fill({ color });
    g.poly([-1, -15, 4, -25, 9, -14]).fill({ color });
  } else if (species === "fox") {
    g.poly([-10, -13, -4, -27, 2, -14]).fill({ color });
    g.poly([-2, -14, 4, -27, 10, -13]).fill({ color });
    g.poly([-6, -19, -4, -24, -2, -19]).fill({ color: FUR_LIGHT });
    g.poly([2, -19, 4, -24, 6, -19]).fill({ color: FUR_LIGHT });
  } else if (species === "bear") {
    g.circle(-8, -18, 5).fill({ color });
    g.circle(8, -18, 5).fill({ color });
  } else if (species === "rabbit") {
    g.roundRect(-9, -31, 5, 17, 3).fill({ color });
    g.roundRect(4, -31, 5, 17, 3).fill({ color });
    g.roundRect(-8, -28, 3, 11, 2).fill({ color: FUR_LIGHT });
    g.roundRect(5, -28, 3, 11, 2).fill({ color: FUR_LIGHT });
  } else {
    // dog: 垂れ耳
    g.ellipse(-10, -9, 4.5, 7.5).fill({ color });
    g.ellipse(10, -9, 4.5, 7.5).fill({ color });
  }

  // 胴体
  g.roundRect(-13, 6, 26, 26, 9).fill({ color });

  // 頭
  g.circle(0, -8, 11).fill({ color });

  // 鼻先（マズル）
  g.ellipse(0, -3, 6, 4.5).fill({ color: FUR_LIGHT });

  // 目・鼻
  g.circle(-4, -9, 1.6).fill({ color: INK });
  g.circle(4, -9, 1.6).fill({ color: INK });
  g.circle(0, -4.5, 1.2).fill({ color: INK });
}

function drawPlant(g: PIXI.Graphics) {
  g.clear();
  g.roundRect(-10, 6, 20, 14, 3).fill({ color: 0x6b4a34 });
  g.circle(-6, 0, 9).fill({ color: 0x3f8f5c });
  g.circle(6, -4, 10).fill({ color: 0x4aa568 });
  g.circle(0, -10, 8).fill({ color: 0x57bd76 });
}

function randRange(a: number, b: number) {
  return a + Math.random() * (b - a);
}

interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface AgentSprite {
  id: string;
  species: Species;
  container: PIXI.Container;
  shadow: PIXI.Graphics;
  body: PIXI.Graphics;
  statusDot: PIXI.Graphics;
  activityText: PIXI.Text;
  bubbleBox: PIXI.Container;
  bubbleBg: PIXI.Graphics;
  bubbleText: PIXI.Text;
  selectionRing: PIXI.Graphics;
  home: { x: number; y: number };
  bounds: Bounds;
  pos: { x: number; y: number };
  target: { x: number; y: number };
  walkState: "idle" | "walking";
  idleUntil: number;
  nextChatAt: number;
  chatUntil: number;
  lastStatus?: EmployeeStatus;
  lastSelected?: boolean;
}

function createBubble(): { box: PIXI.Container; bg: PIXI.Graphics; text: PIXI.Text } {
  const box = new PIXI.Container();
  const bg = new PIXI.Graphics();
  const text = new PIXI.Text({
    text: "",
    style: { fill: 0x161b2c, fontSize: 11, fontWeight: "600" },
  });
  text.anchor.set(0.5, 0.5);
  box.addChild(bg);
  box.addChild(text);
  box.visible = false;
  return { box, bg, text };
}

function showBubble(sprite: AgentSprite, phrase: string, now: number, durationMs = 2600) {
  sprite.bubbleText.text = phrase;
  const w = sprite.bubbleText.width + 16;
  const h = sprite.bubbleText.height + 10;
  sprite.bubbleBg.clear();
  sprite.bubbleBg
    .roundRect(-w / 2, -h - 8, w, h, 7)
    .fill({ color: 0xf4f1ea, alpha: 0.96 });
  sprite.bubbleBg.moveTo(-5, -8).lineTo(0, 0).lineTo(5, -8).fill({ color: 0xf4f1ea, alpha: 0.96 });
  sprite.bubbleText.position.set(0, -8 - h / 2);
  sprite.bubbleBox.visible = true;
  sprite.chatUntil = now + durationMs;
}

function pickPhrase(status: EmployeeStatus): string {
  const pool = CHATTER[status];
  return pool[Math.floor(Math.random() * pool.length)];
}

export interface OfficeMapProps {
  employees: EmployeeView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function OfficeMap({ employees, selectedId, onSelect }: OfficeMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<PIXI.Container | null>(null);
  const spritesRef = useRef<Map<string, AgentSprite>>(new Map());
  const dataRef = useRef<{ employees: EmployeeView[]; selectedId: string | null }>({
    employees,
    selectedId,
  });
  const onSelectRef = useRef(onSelect);
  const structureKeyRef = useRef<string>("");
  const buildRef = useRef<(() => void) | null>(null);
  const updateVisualsRef = useRef<(() => void) | null>(null);
  const readyRef = useRef(false);
  const nextConversationAtRef = useRef(0);

  onSelectRef.current = onSelect;

  useEffect(() => {
    let destroyed = false;
    const app = new PIXI.Application();

    function buildStructure() {
      const world = worldRef.current;
      if (!world) return;
      world.removeChildren();
      spritesRef.current.clear();

      const { boxes, width, height } = layoutDepartments(dataRef.current.employees);
      app.renderer.resize(width, height);
      app.canvas.style.width = `${width}px`;
      app.canvas.style.height = `${height}px`;

      for (const box of boxes) {
        const deptBg = new PIXI.Graphics();
        deptBg
          .roundRect(box.x, box.y, box.w, box.h, 12)
          .fill({ color: 0xf7f0e3 })
          .stroke({ color: 0xdccfb4, width: 1 });
        world.addChild(deptBg);

        // 木目床の質感を出す薄い横線
        const floor = new PIXI.Graphics();
        for (let ly = box.y + DEPT_HEADER + 24; ly < box.y + box.h - 10; ly += 24) {
          floor.moveTo(box.x + 12, ly).lineTo(box.x + box.w - 12, ly);
        }
        floor.stroke({ color: 0xe7dac0, width: 1, alpha: 0.8 });
        world.addChild(floor);

        const label = new PIXI.Text({
          text: box.name,
          style: { fill: 0x8a7c68, fontSize: 13, fontWeight: "600" },
        });
        label.position.set(box.x + 14, box.y + 10);
        world.addChild(label);

        const plant = new PIXI.Graphics();
        drawPlant(plant);
        plant.position.set(box.x + box.w - 22, box.y + box.h - 20);
        world.addChild(plant);

        const bounds: Bounds = {
          x0: box.x + 16,
          x1: box.x + box.w - 16,
          y0: box.y + DEPT_HEADER + 14,
          y1: box.y + box.h - 14,
        };

        box.members.forEach((emp, i) => {
          const col = i % COLS_PER_ROW;
          const row = Math.floor(i / COLS_PER_ROW);
          const dx = box.x + 20 + col * DESK_W;
          const dy = box.y + DEPT_HEADER + row * DESK_H;
          const homeX = dx + DESK_W / 2 - 10;
          const homeY = dy + 50;

          const desk = new PIXI.Graphics();
          desk.roundRect(-32, 28, 64, 10, 3).fill({ color: 0x8b5e3c });
          desk.position.set(homeX, homeY);
          world.addChild(desk);

          const nameText = new PIXI.Text({
            text: emp.name,
            style: { fill: 0x3d3226, fontSize: 11, fontWeight: "700" },
          });
          nameText.anchor.set(0.5, 0);
          nameText.position.set(homeX, homeY + 40);
          world.addChild(nameText);

          const container = new PIXI.Container();
          container.eventMode = "static";
          container.cursor = "pointer";
          container.on("pointertap", () => onSelectRef.current(emp.id));

          const shadow = new PIXI.Graphics();
          shadow.ellipse(0, 34, 15, 5).fill({ color: 0x3d3226, alpha: 0.14 });
          container.addChild(shadow);

          const selectionRing = new PIXI.Graphics();
          selectionRing.circle(0, -8, 26).stroke({ color: 0xc9793f, width: 2 });
          selectionRing.visible = false;
          container.addChild(selectionRing);

          const species = speciesForId(emp.id);
          const body = new PIXI.Graphics();
          drawAnimal(body, STATUS_COLOR[emp.status], species);
          container.addChild(body);

          const statusDot = new PIXI.Graphics();
          statusDot.circle(16, -18, 4).fill({ color: STATUS_COLOR[emp.status] });
          container.addChild(statusDot);

          const activityText = new PIXI.Text({ text: "", style: { fontSize: 14 } });
          activityText.anchor.set(0.5, 1);
          activityText.position.set(14, -22);
          container.addChild(activityText);

          const { box: bubbleBox, bg: bubbleBg, text: bubbleText } = createBubble();
          bubbleBox.position.set(0, -20);
          container.addChild(bubbleBox);

          container.position.set(homeX, homeY);
          world.addChild(container);

          spritesRef.current.set(emp.id, {
            id: emp.id,
            species,
            container,
            shadow,
            body,
            statusDot,
            activityText,
            bubbleBox,
            bubbleBg,
            bubbleText,
            selectionRing,
            home: { x: homeX, y: homeY },
            bounds,
            pos: { x: homeX, y: homeY },
            target: { x: homeX, y: homeY },
            walkState: "idle",
            idleUntil: performance.now() + randRange(500, 4000),
            nextChatAt: performance.now() + randRange(3000, 12000),
            chatUntil: 0,
          });
        });
      }
    }

    function updateVisuals() {
      const { employees: emps, selectedId: sel } = dataRef.current;
      for (const emp of emps) {
        const sprite = spritesRef.current.get(emp.id);
        if (!sprite) continue;

        if (sprite.lastStatus !== emp.status) {
          drawAnimal(sprite.body, STATUS_COLOR[emp.status], sprite.species);
          sprite.statusDot.clear();
          sprite.statusDot.circle(16, -18, 4).fill({ color: STATUS_COLOR[emp.status] });
          sprite.lastStatus = emp.status;
          if (DESK_BOUND_STATUSES.has(emp.status)) {
            sprite.target = { ...sprite.home };
            sprite.walkState = "walking";
          }
        }

        sprite.activityText.text =
          emp.status === "working" ? ACTIVITY_EMOJI[emp.activity ?? "thinking"] ?? "💭" : "";

        const isSelected = emp.id === sel;
        if (sprite.lastSelected !== isSelected) {
          sprite.selectionRing.visible = isSelected;
          sprite.lastSelected = isSelected;
        }
      }
    }

    buildRef.current = buildStructure;
    updateVisualsRef.current = updateVisuals;

    app
      .init({ backgroundAlpha: 0, antialias: true, resolution: window.devicePixelRatio || 1 })
      .then(() => {
        if (destroyed) {
          app.destroy(true, { children: true });
          return;
        }
        const world = new PIXI.Container();
        app.stage.addChild(world);
        worldRef.current = world;
        hostRef.current?.appendChild(app.canvas);
        readyRef.current = true;
        buildStructure();
        updateVisuals();

        let lastTime = performance.now();
        app.ticker.add(() => {
          const now = performance.now();
          const dt = Math.min((now - lastTime) / 1000, 0.1);
          lastTime = now;
          const t = now / 1000;

          for (const sprite of spritesRef.current.values()) {
            const emp = dataRef.current.employees.find((e) => e.id === sprite.id);
            const status = emp?.status ?? "no-agent";

            if (DESK_BOUND_STATUSES.has(status)) {
              // デスクに固定。ステータスごとの演出だけ行う。
              const bob =
                status === "working"
                  ? Math.sin(t * 4 + sprite.home.x) * 3
                  : status === "error"
                    ? Math.sin(t * 16) * 2
                    : 0;
              sprite.pos.x = sprite.home.x + (status === "error" ? bob : 0);
              sprite.pos.y = sprite.home.y + (status === "working" ? bob : 0);
              sprite.body.alpha = status === "waiting" ? 0.6 + Math.sin(t * 6) * 0.4 : 1;
            } else {
              // 自由に歩き回る：目的地に着いたら少し立ち止まり、また別の場所へ歩く
              sprite.body.alpha = status === "no-agent" ? 0.55 : 0.9;

              if (sprite.walkState === "idle") {
                if (now >= sprite.idleUntil) {
                  sprite.target = {
                    x: randRange(sprite.bounds.x0, sprite.bounds.x1),
                    y: randRange(sprite.bounds.y0, sprite.bounds.y1),
                  };
                  sprite.walkState = "walking";
                }
              } else {
                const dx = sprite.target.x - sprite.pos.x;
                const dy = sprite.target.y - sprite.pos.y;
                const dist = Math.hypot(dx, dy);
                if (dist <= 3) {
                  sprite.walkState = "idle";
                  sprite.idleUntil = now + randRange(1200, 4500);
                } else {
                  const step = Math.min(dist, WALK_SPEED * dt);
                  sprite.pos.x += (dx / dist) * step;
                  sprite.pos.y += (dy / dist) * step;
                  sprite.body.scale.x = dx < 0 ? -1 : 1;
                  sprite.pos.y += Math.sin(t * 8) * 0.4; // 歩行の上下ゆれ
                }
              }
            }

            sprite.container.position.set(sprite.pos.x, sprite.pos.y);

            // 雑談の吹き出し
            if (sprite.bubbleBox.visible && now > sprite.chatUntil) {
              sprite.bubbleBox.visible = false;
            }
            if (!sprite.bubbleBox.visible && now >= sprite.nextChatAt) {
              showBubble(sprite, pickPhrase(status), now);
              sprite.nextChatAt = now + randRange(9000, 22000);
            }
          }

          // 近くにいる二人がすれ違い会話するような演出
          if (now >= nextConversationAtRef.current) {
            nextConversationAtRef.current = now + randRange(6000, 14000);
            const sprites = [...spritesRef.current.values()];
            for (let i = 0; i < sprites.length; i++) {
              for (let j = i + 1; j < sprites.length; j++) {
                const a = sprites[i];
                const b = sprites[j];
                if (a.bubbleBox.visible || b.bubbleBox.visible) continue;
                const dist = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
                if (dist < 70) {
                  const empA = dataRef.current.employees.find((e) => e.id === a.id);
                  showBubble(a, pickPhrase(empA?.status ?? "idle"), now);
                  setTimeout(() => {
                    if (!destroyed) showBubble(b, REPLIES[Math.floor(Math.random() * REPLIES.length)], performance.now());
                  }, 700);
                  break;
                }
              }
            }
          }
        });
      });

    return () => {
      destroyed = true;
      readyRef.current = false;
      if (worldRef.current) {
        app.destroy(true, { children: true });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    dataRef.current = { employees, selectedId };
    if (!readyRef.current) return;

    const key = employees.map((e) => `${e.id}:${e.department}`).join(",");
    if (key !== structureKeyRef.current) {
      structureKeyRef.current = key;
      buildRef.current?.();
    }
    updateVisualsRef.current?.();
  }, [employees, selectedId]);

  return <div ref={hostRef} className="office-canvas" />;
}
