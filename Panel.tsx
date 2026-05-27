/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { ComicFace, INITIAL_PAGES, GATE_PAGE } from './types';
import { LoadingFX } from './LoadingFX';

interface PanelProps {
    face?: ComicFace;
    allFaces: ComicFace[];
    onChoice: (pageIndex: number, choice: string) => void;
    onOpenBook: () => void;
    onDownload: () => void;
    onReset: () => void;
    onRegenerate?: (pageIndex: number, caption: string, dialogue: string) => void;
}

export const Panel: React.FC<PanelProps> = ({ face, allFaces, onChoice, onOpenBook, onDownload, onReset, onRegenerate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editCaption, setEditCaption] = useState("");
    const [editDialogue, setEditDialogue] = useState("");

    if (!face) return <div className="w-full h-full bg-gray-950" />;
    
    // We only show LoadingFX if loading AND no imageUrl.
    // If regenerating, we probably have an old image to show while we wait (or we can just show the old image faded)
    if (face.isLoading && !face.imageUrl) return <LoadingFX />;
    
    const isFullBleed = face.type === 'cover' || face.type === 'back_cover';

    const handleEditStart = (e: React.MouseEvent) => {
        e.stopPropagation(); // prevent page flip
        setEditCaption(face.narrative?.caption || "");
        setEditDialogue(face.narrative?.dialogue || "");
        setIsEditing(true);
    };

    const handleEditSave = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(false);
        if (onRegenerate && face.pageIndex !== undefined) {
             onRegenerate(face.pageIndex, editCaption, editDialogue);
        }
    };

    return (
        <div className={`panel-container relative group ${isFullBleed ? '!p-0 !bg-[#0a0a0a]' : ''} ${face.isLoading ? 'opacity-70 grayscale-[50%]' : ''}`}>
            <div className="gloss"></div>
            
            {/* Top-right Edit button appears on hover */}
            {face.type === 'story' && !isEditing && !face.isLoading && face.imageUrl && (
                <button onClick={handleEditStart} className="absolute top-2 right-2 bg-yellow-400 text-black border-2 border-black font-comic hover:bg-yellow-300 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                    ✎ EDIT TEXT
                </button>
            )}

            {isEditing && (
                <div onClick={e => e.stopPropagation()} className="absolute inset-4 bg-white/95 border-4 border-black p-4 z-40 flex flex-col font-sans">
                    <h3 className="font-comic text-xl mb-2 uppercase">Edit Dialogue</h3>
                    <div className="flex-1 overflow-y-auto space-y-2">
                        <label className="block font-bold text-sm">Caption (Narrator)</label>
                        <textarea className="w-full border-2 border-black p-2 h-20 text-sm resize-none" value={editCaption} onChange={e => setEditCaption(e.target.value)} />
                        
                        <label className="block font-bold text-sm">Dialogue (Speech Bubble)</label>
                        <textarea className="w-full border-2 border-black p-2 h-20 text-sm resize-none" value={editDialogue} onChange={e => setEditDialogue(e.target.value)} />
                        
                        <p className="text-xs text-red-600 font-bold">* Saving will redraw the entire artwork with new text.</p>
                    </div>
                    <div className="flex justify-end gap-2 mt-2">
                         <button onClick={() => setIsEditing(false)} className="px-4 py-2 border-2 border-black bg-gray-200 font-comic uppercase">CANCEL</button>
                         <button onClick={handleEditSave} className="px-4 py-2 border-2 border-black bg-green-400 font-comic uppercase">REDRAW PANEL</button>
                    </div>
                </div>
            )}

            {/* If it's regenerating, show a small loader over the old image */}
            {face.isLoading && face.imageUrl && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-30">
                    <div className="bg-white p-4 border-4 border-black rotate-[-2deg] font-comic font-bold text-xl animate-pulse">
                        REDRAWING...
                    </div>
                </div>
            )}

            {face.imageUrl && <img src={face.imageUrl} alt="Comic panel" className={`panel-image ${isFullBleed ? '!object-cover' : ''}`} />}
            
            {/* Decision Buttons */}
            {face.isDecisionPage && face.choices.length > 0 && (
                <div className={`absolute bottom-0 inset-x-0 p-6 pb-12 flex flex-col gap-3 items-center justify-end transition-opacity duration-500 ${face.resolvedChoice ? 'opacity-0 pointer-events-none' : 'opacity-100'} bg-gradient-to-t from-black/90 via-black/50 to-transparent z-20`}>
                    <p className="text-white font-comic text-2xl uppercase tracking-widest animate-pulse">What drives you?</p>
                    {face.choices.map((choice, i) => (
                        <button key={i} onClick={(e) => { e.stopPropagation(); if(face.pageIndex) onChoice(face.pageIndex, choice); }}
                          className={`comic-btn w-full py-3 text-xl font-bold tracking-wider ${i===0?'bg-yellow-400 hover:bg-yellow-300':'bg-blue-500 text-white hover:bg-blue-400'}`}>
                            {choice}
                        </button>
                    ))}
                </div>
            )}

            {/* Cover Action */}
            {face.type === 'cover' && (
                 <div className="absolute bottom-20 inset-x-0 flex justify-center z-20">
                     <button onClick={(e) => { e.stopPropagation(); onOpenBook(); }}
                      disabled={!allFaces.find(f => f.pageIndex === GATE_PAGE)?.imageUrl}
                      className="comic-btn bg-yellow-400 px-10 py-4 text-3xl font-bold hover:scale-105 animate-bounce disabled:animate-none disabled:bg-gray-400 disabled:cursor-wait">
                         {(!allFaces.find(f => f.pageIndex === GATE_PAGE)?.imageUrl) ? `PRINTING... ${allFaces.filter(f => f.type==='story' && f.imageUrl && (f.pageIndex||0) <= GATE_PAGE).length}/${INITIAL_PAGES}` : 'READ ISSUE #1'}
                     </button>
                 </div>
            )}

            {/* Back Cover Actions */}
            {face.type === 'back_cover' && (
                <div className="absolute bottom-24 inset-x-0 flex flex-col items-center gap-4 z-20">
                    <button onClick={(e) => { e.stopPropagation(); onDownload(); }} className="comic-btn bg-blue-500 text-white px-8 py-3 text-xl font-bold hover:scale-105">DOWNLOAD ISSUE</button>
                    <button onClick={(e) => { e.stopPropagation(); onReset(); }} className="comic-btn bg-green-500 text-white px-8 py-4 text-2xl font-bold hover:scale-105">CREATE NEW ISSUE</button>
                </div>
            )}
        </div>
    );
}
