'use client';

import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';

interface Props {
    initialHtml: string;
    onChange: (html: string) => void;
}

export default function ReportEditBody({ initialHtml, onChange }: Props) {
    const [sourceMode, setSourceMode] = useState(false);
    const [sourceDraft, setSourceDraft] = useState('');

    const editor = useEditor({
        extensions: [
            StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
            Underline,
            Link.configure({ openOnClick: false, autolink: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
            Image.configure({ inline: false, allowBase64: true }),
            Table.configure({ resizable: false }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: initialHtml,
        onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
        // Required for SSR with Next.js App Router (React 19).
        immediatelyRender: false,
    });

    useEffect(() => () => { editor?.destroy(); }, [editor]);

    const enterSource = () => {
        if (!editor) return;
        setSourceDraft(editor.getHTML());
        setSourceMode(true);
    };
    const exitSource = () => {
        if (!editor) return;
        editor.commands.setContent(sourceDraft);
        onChange(sourceDraft);
        setSourceMode(false);
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex flex-wrap items-center gap-1 px-2 py-1 border-b border-gray-200 bg-gray-50/50 text-xs">
                {!sourceMode && editor && (
                    <>
                        <ToolbarButton label="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
                        <ToolbarButton label="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
                        <ToolbarButton label="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
                        <Sep />
                        <ToolbarButton label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>•≡</ToolbarButton>
                        <ToolbarButton label="Ordered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1≡</ToolbarButton>
                        <Sep />
                        <ToolbarButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolbarButton>
                        <ToolbarButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolbarButton>
                        <ToolbarButton label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton>
                        <Sep />
                        <ToolbarButton label="Insert table" active={false} onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()}>⊞</ToolbarButton>
                    </>
                )}
                <div className="ml-auto">
                    <ToolbarButton
                        label={sourceMode ? 'Back to editor' : 'HTML source'}
                        active={sourceMode}
                        onClick={sourceMode ? exitSource : enterSource}
                    >
                        {sourceMode ? '← Editor' : 'HTML source'}
                    </ToolbarButton>
                </div>
            </div>
            {sourceMode ? (
                <textarea
                    value={sourceDraft}
                    onChange={(e) => setSourceDraft(e.target.value)}
                    className="flex-1 min-h-0 p-3 font-mono text-xs border-none outline-none resize-none"
                    spellCheck={false}
                />
            ) : (
                <div className="flex-1 min-h-0 overflow-auto report-prose text-sm leading-relaxed">
                    <EditorContent editor={editor} className="p-3 min-h-full focus:outline-none" />
                </div>
            )}
        </div>
    );
}

function Sep() {
    return <div className="h-4 w-px bg-gray-300 mx-1" />;
}

function ToolbarButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={`px-2 py-0.5 rounded border text-xs ${active ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'}`}
        >
            {children}
        </button>
    );
}
