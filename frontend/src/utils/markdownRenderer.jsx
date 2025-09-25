import React from 'react';

/**
 * Simple markdown renderer for OptioBot responses
 * Handles: **bold**, • bullets, and line breaks
 */
export const renderMarkdown = (text) => {
  if (!text) return null;

  // Split by lines to handle bullets and formatting per line
  const lines = text.split('\n');

  return lines.map((line, lineIndex) => {
    if (line.trim() === '') {
      // Empty line - add spacing
      return <br key={lineIndex} />;
    }

    // Handle bullet points
    if (line.trim().startsWith('•')) {
      const bulletContent = line.trim().substring(1).trim();
      return (
        <div key={lineIndex} className="flex items-start space-x-2 my-1">
          <span className="text-purple-600 font-bold flex-shrink-0">•</span>
          <span>{renderInlineMarkdown(bulletContent)}</span>
        </div>
      );
    }

    // Regular line with inline formatting
    return (
      <div key={lineIndex} className="my-1">
        {renderInlineMarkdown(line)}
      </div>
    );
  });
};

/**
 * Render inline markdown formatting (**bold**)
 */
const renderInlineMarkdown = (text) => {
  if (!text) return '';

  // Handle **bold** text
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const boldText = part.slice(2, -2);
      return (
        <strong key={index} className="font-semibold text-gray-900">
          {boldText}
        </strong>
      );
    }
    return part;
  });
};

/**
 * Alternative simple renderer that just handles bold and preserves line breaks
 */
export const renderSimpleMarkdown = (text) => {
  if (!text) return null;

  // Split by double newlines for paragraphs, then single newlines for line breaks
  const paragraphs = text.split('\n\n');

  return paragraphs.map((paragraph, pIndex) => (
    <div key={pIndex} className="mb-3 last:mb-0">
      {paragraph.split('\n').map((line, lIndex) => (
        <div key={lIndex}>
          {renderInlineMarkdown(line)}
          {lIndex < paragraph.split('\n').length - 1 && <br />}
        </div>
      ))}
    </div>
  ));
};

export default renderMarkdown;