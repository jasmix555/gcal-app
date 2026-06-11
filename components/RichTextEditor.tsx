"use client";

import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const toolBtn =
  "flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm text-slate-600 transition hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700";

/**
 * Lightweight rich-text editor built on contentEditable + document.execCommand
 * (no third-party dependencies). Emits HTML. Supports bold/italic/underline/
 * strikethrough, H1–H3, paragraphs, bullet/numbered lists, checklists, quotes.
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);

  // Sync external value in only when the editor isn't being typed into,
  // so we never yank the caret while the user writes.
  useEffect(() => {
    const el = ref.current;
    if (el && !focused.current && el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
  }, [value]);

  function emit() {
    onChange(ref.current?.innerHTML || "");
  }

  function exec(cmd: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  }

  function insertChecklist() {
    ref.current?.focus();
    const html =
      '<ul class="todo-list"><li><input type="checkbox"/><span>To-do</span></li></ul>';
    document.execCommand("insertHTML", false, html);
    emit();
  }

  // Toggle a checkbox and persist its state into the HTML attribute, since
  // browsers don't serialize the `checked` property into innerHTML.
  function onEditorClick(e: React.MouseEvent) {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.type === "checkbox") {
      setTimeout(() => {
        if (t.checked) t.setAttribute("checked", "checked");
        else t.removeAttribute("checked");
        emit();
      }, 0);
    }
  }

  const Btn = ({
    onAct,
    title,
    children,
  }: {
    onAct: () => void;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={toolBtn}
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
        <Btn onAct={() => exec("bold")} title="Bold">
          <span className="font-bold">B</span>
        </Btn>
        <Btn onAct={() => exec("italic")} title="Italic">
          <span className="italic">I</span>
        </Btn>
        <Btn onAct={() => exec("underline")} title="Underline">
          <span className="underline">U</span>
        </Btn>
        <Btn onAct={() => exec("strikeThrough")} title="Strikethrough">
          <span className="line-through">S</span>
        </Btn>
        {divider}
        <Btn onAct={() => exec("formatBlock", "h1")} title="Heading 1">
          H1
        </Btn>
        <Btn onAct={() => exec("formatBlock", "h2")} title="Heading 2">
          H2
        </Btn>
        <Btn onAct={() => exec("formatBlock", "h3")} title="Heading 3">
          H3
        </Btn>
        <Btn onAct={() => exec("formatBlock", "p")} title="Paragraph">
          ¶
        </Btn>
        {divider}
        <Btn onAct={() => exec("insertUnorderedList")} title="Bullet list">
          •
        </Btn>
        <Btn onAct={() => exec("insertOrderedList")} title="Numbered list">
          1.
        </Btn>
        <Btn onAct={insertChecklist} title="Checklist">
          ☑
        </Btn>
        <Btn onAct={() => exec("formatBlock", "blockquote")} title="Quote">
          ❝
        </Btn>
        {divider}
        <Btn onAct={() => exec("removeFormat")} title="Clear formatting">
          ⌫
        </Btn>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || "Write something…"}
        onInput={emit}
        onClick={onEditorClick}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          emit();
        }}
        className="rte-content min-h-[180px] max-h-[45vh] overflow-y-auto px-3 py-2 text-sm text-slate-800 outline-none dark:text-slate-100"
      />
    </div>
  );
}
