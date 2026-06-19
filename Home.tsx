/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { SeriesSummary } from "./types";

interface HomeProps {
  library: SeriesSummary[];
  onCreate: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export const Home: React.FC<HomeProps> = ({ library, onCreate, onOpen, onDelete }) => {
  return (
    <div className="fixed inset-0 z-[150] overflow-y-auto bg-black/85 backdrop-blur-md">
      <div className="min-h-full flex flex-col items-center p-6 py-10">
        <div className="text-center mb-2">
          <h1 className="font-comic text-6xl text-red-600 inline-block mr-3" style={{ textShadow: "3px 3px 0 black" }}>INFINITE</h1>
          <h1 className="font-comic text-6xl text-yellow-400 inline-block" style={{ textShadow: "3px 3px 0 black" }}>HEROES</h1>
          <p className="font-comic text-xl text-white tracking-widest mt-1">YOUR MULTI-ISSUE COMIC SAGAS</p>
        </div>

        <button onClick={onCreate} className="comic-btn bg-green-500 text-black text-2xl px-8 py-3 my-6 uppercase">+ New Saga</button>

        {library.length === 0 ? (
          <div className="bg-white border-[6px] border-black p-8 max-w-md text-center rotate-1 shadow-[10px_10px_0_rgba(0,0,0,.6)]">
            <p className="font-comic text-3xl mb-2">No sagas yet!</p>
            <p className="font-sans text-gray-700">Create your party of heroes, lock in a style, and turn your adventures into a comic series where <b>you</b> are the stars. Perfect for your D&amp;D campaign.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 w-full max-w-5xl">
            {library.map((s) => (
              <div key={s.id} className="bg-white border-4 border-black shadow-[8px_8px_0_rgba(0,0,0,.6)] flex flex-col overflow-hidden hover:-translate-y-1 transition-transform">
                <button onClick={() => onOpen(s.id)} className="block text-left">
                  <div className="aspect-[2/3] bg-gray-900 relative">
                    {s.coverUrl ? (
                      <img src={s.coverUrl} alt={s.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-comic text-gray-500 text-center p-3">{s.title}</div>
                    )}
                    <span className="absolute top-1 right-1 bg-black text-white text-xs font-comic px-2 py-0.5">#{s.issueCount}</span>
                    {s.safeMode && <span className="absolute top-1 left-1 bg-green-400 text-black text-[10px] font-bold px-1.5 py-0.5 border border-black">SAFE</span>}
                  </div>
                </button>
                <div className="p-2">
                  <div className="font-comic text-lg leading-tight truncate">{s.title}</div>
                  <div className="text-xs text-gray-600">{s.castCount} cast · {s.style}</div>
                  <div className="flex gap-1 mt-2">
                    <button onClick={() => onOpen(s.id)} className="flex-1 text-xs border-2 border-black bg-yellow-300 font-comic py-1">OPEN</button>
                    <button onClick={() => { if (confirm(`Delete "${s.title}"? This cannot be undone.`)) onDelete(s.id); }}
                      className="text-xs border-2 border-black bg-red-300 font-comic px-2">✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
