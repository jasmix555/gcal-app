"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const toolBtn =
  "flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700";
const activeCls =
  "bg-slate-200 text-slate-900 dark:bg-slate-600 dark:text-white";

type ActiveState = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  ul?: boolean;
  ol?: boolean;
  h1?: boolean;
  h2?: boolean;
  h3?: boolean;
  quote?: boolean;
  todo?: boolean;
};

const LINE_TAGS = ["DIV", "P", "LI", "H1", "H2", "H3", "BLOCKQUOTE"];

/**
 * Lightweight rich-text editor (no third-party deps) built on contentEditable.
 * Inline marks use execCommand; block structures (todos, quotes, clear-format,
 * Enter behaviour, undo/redo) are handled directly so it feels like iOS Notes:
 *  - toolbar buttons light up when the caret sits in matching formatting
 *  - todos are independent lines (Enter adds/splits a sibling, never nests;
 *    Enter on an empty todo exits to normal text)
 *  - Enter on an empty quoted line exits the quote
 *  - clear-formatting resets inline marks AND block structure
 *  - undo/redo via an internal snapshot history (covers custom edits too)
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [active, setActive] = useState<ActiveState>({});
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Snapshot history for reliable undo/redo across custom DOM edits.
  const hist = useRef<{ stack: string[]; i: number }>({ stack: [""], i: 0 });
  const applying = useRef(false);
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncHistFlags = useCallback(() => {
    setCanUndo(hist.current.i > 0);
    setCanRedo(hist.current.i < hist.current.stack.length - 1);
  }, []);

  const resetHistory = useCallback(
    (html: string) => {
      hist.current = { stack: [html || ""], i: 0 };
      syncHistFlags();
    },
    [syncHistFlags]
  );

  // Push external value in only when not actively typing, to protect the caret.
  useEffect(() => {
    const el = ref.current;
    if (el && !focused.current && el.innerHTML !== value) {
      el.innerHTML = value || "";
      resetHistory(value || "");
    }
  }, [value, resetHistory]);

  const emit = useCallback(() => {
    onChange(ref.current?.innerHTML || "");
  }, [onChange]);

  const record = useCallback(() => {
    if (applying.current) return;
    const html = ref.current?.innerHTML ?? "";
    const h = hist.current;
    if (html === h.stack[h.i]) return;
    h.stack = h.stack.slice(0, h.i + 1);
    h.stack.push(html);
    if (h.stack.length > 200) h.stack.shift();
    h.i = h.stack.length - 1;
    syncHistFlags();
  }, [syncHistFlags]);

  // Emit to parent + schedule a (debounced) history snapshot.
  const commit = useCallback(() => {
    emit();
    if (recordTimer.current) clearTimeout(recordTimer.current);
    recordTimer.current = setTimeout(record, 350);
  }, [emit, record]);

  // ---- selection helpers ---------------------------------------------------

  const currentLine = useCallback((): HTMLElement | null => {
    const editor = ref.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return null;
    let node: Node | null = sel.anchorNode;
    while (node && node !== editor) {
      if (node instanceof HTMLElement) {
        if (node.classList.contains("todo-item")) return node;
        if (LINE_TAGS.includes(node.tagName)) return node;
      }
      node = node.parentNode;
    }
    return null;
  }, []);

  const caretInto = useCallback((el: HTMLElement, atStart = false) => {
    const target = el.classList.contains("todo-item")
      ? el.querySelector("span") || el
      : el;
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(atStart);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  // ---- active-state tracking ----------------------------------------------

  const refresh = useCallback(() => {
    const editor = ref.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return;
    if (!editor.contains(sel.anchorNode)) return;
    let block = "";
    try {
      block = (document.queryCommandValue("formatBlock") || "").toLowerCase();
    } catch {
      /* ignore */
    }
    const anchorEl =
      sel.anchorNode instanceof Element
        ? sel.anchorNode
        : sel.anchorNode?.parentElement || null;
    const has = (cmd: string) => {
      try {
        return document.queryCommandState(cmd);
      } catch {
        return false;
      }
    };
    setActive({
      bold: has("bold"),
      italic: has("italic"),
      underline: has("underline"),
      strike: has("strikeThrough"),
      ul: has("insertUnorderedList"),
      ol: has("insertOrderedList"),
      h1: block === "h1",
      h2: block === "h2",
      h3: block === "h3",
      quote: !!anchorEl?.closest("blockquote"),
      todo: !!anchorEl?.closest(".todo-item, .todo-list"),
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  }, [refresh]);

  // ---- commands ------------------------------------------------------------

  function inline(cmd: string) {
    ref.current?.focus();
    document.execCommand(cmd, false);
    commit();
    refresh();
  }

  function toggleBlock(tag: string) {
    ref.current?.focus();
    let cur = "";
    try {
      cur = (document.queryCommandValue("formatBlock") || "").toLowerCase();
    } catch {
      /* ignore */
    }
    document.execCommand("formatBlock", false, cur === tag ? "div" : tag);
    commit();
    refresh();
  }

  function toggleList(cmd: string) {
    ref.current?.focus();
    document.execCommand(cmd, false);
    commit();
    refresh();
  }

  function makeTodo(text = ""): HTMLDivElement {
    const div = document.createElement("div");
    div.className = "todo-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    const span = document.createElement("span");
    span.textContent = text;
    div.append(cb, span);
    return div;
  }

  function insertTodo() {
    const editor = ref.current;
    if (!editor) return;
    editor.focus();
    const line = currentLine();
    const todo = makeTodo("");
    if (line && line !== editor && editor.contains(line)) {
      const empty = !(line.textContent || "").trim();
      if (empty && !line.classList.contains("todo-item"))
        line.replaceWith(todo);
      else line.after(todo);
    } else {
      editor.appendChild(todo);
    }
    caretInto(todo);
    commit();
    refresh();
  }

  function clearFormat() {
    const editor = ref.current;
    if (!editor) return;
    editor.focus();
    const line = currentLine();
    // A todo line becomes a plain line keeping its text.
    if (line && line.classList.contains("todo-item")) {
      const span = line.querySelector("span");
      const div = document.createElement("div");
      if (span?.textContent) div.textContent = span.textContent;
      else div.appendChild(document.createElement("br"));
      line.replaceWith(div);
      caretInto(div);
      commit();
      refresh();
      return;
    }
    document.execCommand("removeFormat", false);
    document.execCommand("unlink", false);
    try {
      if (document.queryCommandState("insertUnorderedList"))
        document.execCommand("insertUnorderedList", false);
      if (document.queryCommandState("insertOrderedList"))
        document.execCommand("insertOrderedList", false);
    } catch {
      /* ignore */
    }
    document.execCommand("formatBlock", false, "div");
    commit();
    refresh();
  }

  // ---- undo / redo ---------------------------------------------------------

  const undo = useCallback(() => {
    if (recordTimer.current) clearTimeout(recordTimer.current);
    record();
    const h = hist.current;
    if (h.i <= 0) return;
    h.i--;
    applying.current = true;
    if (ref.current) ref.current.innerHTML = h.stack[h.i];
    applying.current = false;
    emit();
    syncHistFlags();
    refresh();
  }, [record, emit, syncHistFlags, refresh]);

  const redo = useCallback(() => {
    const h = hist.current;
    if (h.i >= h.stack.length - 1) return;
    h.i++;
    applying.current = true;
    if (ref.current) ref.current.innerHTML = h.stack[h.i];
    applying.current = false;
    emit();
    syncHistFlags();
    refresh();
  }, [emit, syncHistFlags, refresh]);

  // ---- key handling --------------------------------------------------------

  function onKeyDown(e: React.KeyboardEvent) {
    // Undo / redo shortcuts (handle ourselves so custom edits are covered).
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }

    if (e.key !== "Enter" || e.shiftKey) return;
    const editor = ref.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return;
    const anchorEl =
      sel.anchorNode instanceof Element
        ? sel.anchorNode
        : sel.anchorNode?.parentElement || null;

    // --- Todo line: split into a sibling todo; exit if empty ---
    const todoEl = anchorEl?.closest(".todo-item") as HTMLElement | null;
    if (todoEl && editor.contains(todoEl)) {
      const span = todoEl.querySelector("span");
      e.preventDefault();
      if (!(span?.textContent || "").trim()) {
        // Empty todo → leave the list as a normal line.
        const div = document.createElement("div");
        div.appendChild(document.createElement("br"));
        todoEl.replaceWith(div);
        caretInto(div);
      } else {
        // Move whatever is after the caret into the new todo.
        let tail = "";
        if (span) {
          const r = sel.getRangeAt(0);
          const after = document.createRange();
          after.selectNodeContents(span);
          try {
            after.setStart(r.endContainer, r.endOffset);
            tail = after.toString();
            after.deleteContents();
          } catch {
            /* caret not inside span; treat as append */
          }
        }
        const todo = makeTodo(tail);
        todoEl.after(todo);
        caretInto(todo, true);
      }
      commit();
      refresh();
      return;
    }

    // --- Quote: Enter on an empty quoted line exits the quote ---
    const line = currentLine();
    const bq = line?.closest("blockquote");
    if (line && bq && editor.contains(bq) && !(line.textContent || "").trim()) {
      e.preventDefault();
      const div = document.createElement("div");
      div.appendChild(document.createElement("br"));
      bq.after(div);
      if (line !== bq && bq.contains(line)) line.remove();
      if (bq.children.length === 0 && !(bq.textContent || "").trim())
        bq.remove();
      caretInto(div);
      commit();
      refresh();
    }
  }

  function onEditorClick(e: React.MouseEvent) {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.type === "checkbox") {
      setTimeout(() => {
        if (t.checked) t.setAttribute("checked", "checked");
        else t.removeAttribute("checked");
        commit();
      }, 0);
    }
  }

  // ---- toolbar -------------------------------------------------------------

  const Btn = ({
    onAct,
    title,
    on,
    disabled,
    children,
  }: {
    onAct: () => void;
    title: string;
    on?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={!!on}
      disabled={disabled}
      className={`${toolBtn} ${on ? activeCls : ""}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onAct}
    >
      {children}
    </button>
  );

  const divider = (
    <span className="mx-0.5 h-5 w-px self-center bg-slate-200 dark:bg-slate-600" />
  );

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 p-1 dark:border-slate-700">
        <Btn onAct={undo} title="Undo" disabled={!canUndo}>
          ↶
        </Btn>
        <Btn onAct={redo} title="Redo" disabled={!canRedo}>
          ↷
        </Btn>
        {divider}
        <Btn onAct={() => inline("bold")} title="Bold" on={active.bold}>
          <span className="font-bold">B</span>
        </Btn>
        <Btn onAct={() => inline("italic")} title="Italic" on={active.italic}>
          <span className="italic">I</span>
        </Btn>
        <Btn
          onAct={() => inline("underline")}
          title="Underline"
          on={active.underline}
        >
          <span className="underline">U</span>
        </Btn>
        <Btn
          onAct={() => inline("strikeThrough")}
          title="Strikethrough"
          on={active.strike}
        >
          <span className="line-through">S</span>
        </Btn>
        {divider}
        <Btn onAct={() => toggleBlock("h1")} title="Heading 1" on={active.h1}>
          H1
        </Btn>
        <Btn onAct={() => toggleBlock("h2")} title="Heading 2" on={active.h2}>
          H2
        </Btn>
        <Btn onAct={() => toggleBlock("h3")} title="Heading 3" on={active.h3}>
          H3
        </Btn>
        <Btn onAct={() => toggleBlock("div")} title="Normal text">
          ¶
        </Btn>
        {divider}
        <Btn
          onAct={() => toggleList("insertUnorderedList")}
          title="Bullet list"
          on={active.ul}
        >
          •
        </Btn>
        <Btn
          onAct={() => toggleList("insertOrderedList")}
          title="Numbered list"
          on={active.ol}
        >
          1.
        </Btn>
        <Btn onAct={insertTodo} title="Checklist" on={active.todo}>
          ☑
        </Btn>
        <Btn
          onAct={() => toggleBlock("blockquote")}
          title="Quote"
          on={active.quote}
        >
          ❝
        </Btn>
        {divider}
        <Btn onAct={clearFormat} title="Clear formatting">
          ⌫
        </Btn>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || "Write something…"}
        onInput={commit}
        onClick={onEditorClick}
        onKeyDown={onKeyDown}
        onKeyUp={refresh}
        onMouseUp={refresh}
        onFocus={() => {
          focused.current = true;
          refresh();
        }}
        onBlur={() => {
          focused.current = false;
          if (recordTimer.current) clearTimeout(recordTimer.current);
          record();
          emit();
        }}
        className="rte-content min-h-[180px] max-h-[45vh] overflow-y-auto px-3 py-2 text-sm text-slate-800 outline-none dark:text-slate-100"
      />
    </div>
  );
}
