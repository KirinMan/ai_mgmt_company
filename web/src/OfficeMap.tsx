import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import type { Activity, EmployeeStatus, EmployeeView } from "./types";

const DESK_W = 130;
const DESK_H = 100;
const COLS_PER_ROW = 3;
const DEPT_PADDING = 18;
const DEPT_HEADER = 34;
const MAP_COLS = 2;
const COL_WIDTH = 440;

const STATUS_COLOR: Record<EmployeeStatus, number> = {
  "no-agent": 0x3a4260,
  idle: 0x5a6588,
  working: 0x57e0c2,
  waiting: 0xf4c352,
  done: 0x6fcf7d,
  error: 0xf2685c,
};

const ACTIVITY_EMOJI: Partial<Record<Activity, string>> = {
  starting: "🚪",
  thinking: "💭",
  typing: "⌨️",
  reading: "📖",
  running: "⚙️",
  researching: "🔍",
  waiting: "❗",
};

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
    const h = DEPT_HEADER + rows * DESK_H + DEPT_PADDING;
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

function drawCharacter(g: PIXI.Graphics, color: number) {
  g.clear();
  g.roundRect(-13, 6, 26, 26, 7).fill({ color });
  g.circle(0, -8, 11).fill({ color: 0xf0cda0 });
  g.circle(-4, -9, 1.6).fill({ color: 0x2a2a2a });
  g.circle(4, -9, 1.6).fill({ color: 0x2a2a2a });
}

interface DeskSprite {
  container: PIXI.Container;
  body: PIXI.Graphics;
  baseY: number;
}

export interface OfficeMapProps {
  employees: EmployeeView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function OfficeMap({ employees, selectedId, onSelect }: OfficeMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<PIXI.Container | null>(null);
  const deskSpritesRef = useRef<Map<string, DeskSprite>>(new Map());
  const dataRef = useRef<{ employees: EmployeeView[]; selectedId: string | null }>({
    employees,
    selectedId,
  });
  const onSelectRef = useRef(onSelect);
  const rebuildRef = useRef<(() => void) | null>(null);
  const readyRef = useRef(false);

  onSelectRef.current = onSelect;

  useEffect(() => {
    let destroyed = false;
    const app = new PIXI.Application();

    function rebuild() {
      const world = worldRef.current;
      if (!world) return;
      world.removeChildren();
      deskSpritesRef.current.clear();

      const { boxes, width, height } = layoutDepartments(dataRef.current.employees);
      app.renderer.resize(width, height);
      app.canvas.style.width = `${width}px`;
      app.canvas.style.height = `${height}px`;

      for (const box of boxes) {
        const deptBg = new PIXI.Graphics();
        deptBg
          .roundRect(box.x, box.y, box.w, box.h, 12)
          .fill({ color: 0x141a2c, alpha: 0.6 })
          .stroke({ color: 0x2a3350, width: 1 });
        world.addChild(deptBg);

        const label = new PIXI.Text({
          text: box.name,
          style: { fill: 0x98a2c3, fontSize: 13, fontWeight: "600" },
        });
        label.position.set(box.x + 14, box.y + 10);
        world.addChild(label);

        box.members.forEach((emp, i) => {
          const col = i % COLS_PER_ROW;
          const row = Math.floor(i / COLS_PER_ROW);
          const dx = box.x + 20 + col * DESK_W;
          const dy = box.y + DEPT_HEADER + row * DESK_H;

          const container = new PIXI.Container();
          container.position.set(dx + DESK_W / 2 - 10, dy + 50);
          container.eventMode = "static";
          container.cursor = "pointer";
          container.on("pointertap", () => onSelectRef.current(emp.id));

          if (emp.id === dataRef.current.selectedId) {
            const ring = new PIXI.Graphics();
            ring.circle(0, -8, 26).stroke({ color: 0xff9d4d, width: 2 });
            container.addChild(ring);
          }

          const desk = new PIXI.Graphics();
          desk.roundRect(-32, 28, 64, 10, 3).fill({ color: 0x2a3350 });
          container.addChild(desk);

          const body = new PIXI.Graphics();
          drawCharacter(body, STATUS_COLOR[emp.status]);
          container.addChild(body);

          const statusDot = new PIXI.Graphics();
          statusDot.circle(16, -18, 4).fill({ color: STATUS_COLOR[emp.status] });
          container.addChild(statusDot);

          const nameText = new PIXI.Text({
            text: emp.name,
            style: { fill: 0xe9ecf7, fontSize: 11, fontWeight: "700" },
          });
          nameText.anchor.set(0.5, 0);
          nameText.position.set(0, 40);
          container.addChild(nameText);

          if (emp.status === "working") {
            const activityText = new PIXI.Text({
              text: ACTIVITY_EMOJI[emp.activity ?? "thinking"] ?? "💭",
              style: { fontSize: 14 },
            });
            activityText.anchor.set(0.5, 1);
            activityText.position.set(14, -22);
            container.addChild(activityText);
          }

          world.addChild(container);
          deskSpritesRef.current.set(emp.id, {
            container,
            body,
            baseY: container.position.y,
          });
        });
      }
    }

    rebuildRef.current = rebuild;

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
        rebuild();

        app.ticker.add(() => {
          const t = performance.now() / 1000;
          for (const [id, sprite] of deskSpritesRef.current) {
            const emp = dataRef.current.employees.find((e) => e.id === id);
            if (!emp) continue;
            if (emp.status === "working") {
              sprite.container.y = sprite.baseY + Math.sin(t * 4 + sprite.baseY) * 3;
              sprite.body.alpha = 1;
            } else if (emp.status === "waiting") {
              sprite.container.y = sprite.baseY;
              sprite.body.alpha = 0.6 + Math.sin(t * 6) * 0.4;
            } else {
              sprite.container.y = sprite.baseY;
              sprite.body.alpha = emp.status === "no-agent" ? 0.45 : 0.85;
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
    if (readyRef.current) rebuildRef.current?.();
  }, [employees, selectedId]);

  return <div ref={hostRef} className="office-canvas" />;
}
