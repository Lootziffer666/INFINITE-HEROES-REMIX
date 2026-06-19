/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ComicFace } from "./types";
import { Panel } from "./Panel";

interface BookProps {
  comicFaces: ComicFace[];
  currentSheetIndex: number;
  isStarted: boolean;
  isSetupVisible: boolean;
  onSheetClick: (index: number) => void;
  onChoice: (beatNum: number, choice: string) => void;
  onOpenBook: () => void;
  onDownload: () => void;
  onReset: () => void;
  onRegenerateFace: (beatNum: number, caption: string, dialogue: string) => void;
}

export const Book: React.FC<BookProps> = (props) => {
  // Render the book as physical sheets: faces are paired sequentially in
  // page order (front, back, front, back ...). This supports a variable page
  // count (e.g. issues with a "Previously..." recap page).
  const ordered = [...props.comicFaces].sort((a, b) => (a.pageIndex || 0) - (b.pageIndex || 0));
  const sheets: { front?: ComicFace; back?: ComicFace }[] = [];
  for (let i = 0; i < ordered.length; i += 2) {
    sheets.push({ front: ordered[i], back: ordered[i + 1] });
  }
  if (sheets.length === 0) sheets.push({ front: undefined, back: undefined });

  return (
    <div
      className={`book ${props.currentSheetIndex > 0 ? "opened" : ""} transition-all duration-1000 ease-in-out`}
      style={props.isSetupVisible ? { transform: "translateZ(-600px) translateY(-100px) rotateX(20deg) scale(0.9)", filter: "blur(6px) brightness(0.7)", pointerEvents: "none" } : {}}
    >
      {sheets.map((sheet, i) => (
        <div
          key={i}
          className={`paper ${i < props.currentSheetIndex ? "flipped" : ""}`}
          style={{ zIndex: i < props.currentSheetIndex ? i : sheets.length - i }}
          onClick={() => props.onSheetClick(i)}
        >
          <div className="front">
            <Panel face={sheet.front} allFaces={props.comicFaces} onChoice={props.onChoice} onOpenBook={props.onOpenBook} onDownload={props.onDownload} onReset={props.onReset} onRegenerate={props.onRegenerateFace} />
          </div>
          <div className="back">
            <Panel face={sheet.back} allFaces={props.comicFaces} onChoice={props.onChoice} onOpenBook={props.onOpenBook} onDownload={props.onDownload} onReset={props.onReset} onRegenerate={props.onRegenerateFace} />
          </div>
        </div>
      ))}
    </div>
  );
};
