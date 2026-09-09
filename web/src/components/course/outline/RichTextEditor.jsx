import React, { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { usePromptText } from '../../../contexts/ConfirmContext'

/**
 * RichTextEditor - Simplified WYSIWYG editor for project descriptions
 * Supports headings (H1-H3), bold, italic, links, lists, and text alignment
 *
 * `alignment` is opt-out because alignment is carried by a style attribute, and
 * the announcement pipeline (sanitized HTML through email and the family page)
 * deliberately allows no style attributes. Offering buttons whose effect
 * silently disappears on save is worse than not offering them.
 *
 * Links: StarterKit v3 bundles the Link extension (pasted URLs autolink);
 * the toolbar button lets an author put the link on the words they wrote
 * ("Sign up here") instead of pasting a raw URL. openOnClick is off so
 * clicking a link while editing edits it rather than navigating away.
 */
const RichTextEditor = ({
  value = '',
  onChange,
  placeholder = 'Enter description...',
  minHeight = '200px',
  alignment = true,
}) => {
  const isInternalUpdate = useRef(false)
  const promptText = usePromptText()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      ...(alignment ? [TextAlign.configure({
        types: ['heading', 'paragraph'],
      })] : []),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true
      const html = editor.getHTML()
      onChange(html)
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm focus:outline-none max-w-none p-4`,
        style: `min-height: ${minHeight}`,
      },
    },
  })

  // Update editor content when value prop changes externally (e.g., switching projects)
  useEffect(() => {
    if (editor && !isInternalUpdate.current) {
      // Only update if the value is different from current content
      const currentContent = editor.getHTML()
      if (value !== currentContent) {
        editor.commands.setContent(value || '')
      }
    }
    isInternalUpdate.current = false
  }, [value, editor])

  if (!editor) {
    return null
  }

  const editLink = async () => {
    let url = await promptText({ title: 'Link URL', placeholder: 'https://…' })
    if (url === null) return // cancelled
    url = url.trim()
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) url = `https://${url}`
    if (editor.state.selection.empty && !editor.isActive('link')) {
      // Nothing selected: insert the URL itself as a link.
      editor.chain().focus().insertContent({
        type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }],
      }).run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  const MenuButton = ({ onClick, isActive, children, title }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`
        px-2 py-1 rounded transition-colors min-w-[28px] h-[28px]
        flex items-center justify-center text-xs font-medium
        ${isActive
          ? 'bg-optio-purple text-white'
          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
        }
      `}
    >
      {children}
    </button>
  )

  const Divider = () => <div className="w-px h-5 bg-gray-200 mx-0.5" />

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="bg-gray-50 border-b border-gray-200 px-2 py-1.5 flex items-center gap-0.5 flex-wrap">
        {/* Headings */}
        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          H1
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          H2
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          H3
        </MenuButton>

        <Divider />

        {/* Text Formatting */}
        <MenuButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold (Ctrl+B)"
        >
          <span className="font-bold">B</span>
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic (Ctrl+I)"
        >
          <span className="italic">I</span>
        </MenuButton>
        <MenuButton
          onClick={editLink}
          isActive={editor.isActive('link')}
          title="Add link"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
        </MenuButton>
        {editor.isActive('link') && (
          <MenuButton
            onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
            title="Remove link"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-1.5 1.5m-5.304-5.304l-1.757 1.757a4.5 4.5 0 006.364 6.364l1.5-1.5m4.286-9.286l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-1.5 1.5M3 3l18 18" />
            </svg>
          </MenuButton>
        )}

        {alignment && <Divider />}

        {/* Alignment */}
        {alignment && (<>
        <MenuButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          isActive={editor.isActive({ textAlign: 'left' })}
          title="Align Left"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" />
          </svg>
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
          title="Align Center"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M4 18h16" />
          </svg>
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
          title="Align Right"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M4 18h16" />
          </svg>
        </MenuButton>
        </>)}

        <Divider />

        {/* Lists */}
        <MenuButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h.01M8 6h12M4 12h.01M8 12h12M4 18h.01M8 18h12" />
          </svg>
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Numbered List"
        >
          <span className="text-[10px] font-medium">1.</span>
        </MenuButton>

        <Divider />

        {/* Undo/Redo */}
        <div className="ml-auto flex gap-0.5">
          <MenuButton
            onClick={() => editor.chain().focus().undo().run()}
            title="Undo (Ctrl+Z)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" />
            </svg>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().redo().run()}
            title="Redo (Ctrl+Shift+Z)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a5 5 0 00-5 5v2m15-7l-4-4m4 4l-4 4" />
            </svg>
          </MenuButton>
        </div>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  )
}

export default RichTextEditor
