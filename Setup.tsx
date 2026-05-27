/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { LANGUAGES, Persona, StorySettings, CharacterStats } from './types';

interface SetupProps {
    show: boolean;
    isTransitioning: boolean;
    hero: Persona | null;
    friend: Persona | null;
    villain: Persona | null;
    storySettings: StorySettings;
    selectedLanguage: string;
    richMode: boolean;
    onHeroUpload: (file: File, stats: CharacterStats, name: string) => void;
    onFriendUpload: (file: File, stats: CharacterStats, name: string) => void;
    onVillainUpload: (file: File, stats: CharacterStats, name: string) => void;
    onStorySettingsChange: (settings: StorySettings) => void;
    onLanguageChange: (val: string) => void;
    onRichModeChange: (val: boolean) => void;
    onLaunch: () => void;
}

const defaultStats: CharacterStats = { strength: 5, intelligence: 5, charisma: 5, darkness: 5, luck: 5 };

export const Setup: React.FC<SetupProps> = (props) => {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    
    // Character form states
    const [activeRole, setActiveRole] = useState<'hero' | 'friend' | 'villain'>('hero');
    const [charName, setCharName] = useState("");
    const [charStats, setCharStats] = useState<CharacterStats>(defaultStats);
    const [charFile, setCharFile] = useState<File | null>(null);

    // Temp story
    const [tempStory, setTempStory] = useState(props.storySettings);

    if (!props.show && !props.isTransitioning) return null;

    const saveCharacter = () => {
        if (!charFile && !getRoleData(activeRole)) return; // Requires file to save new
        
        if (charFile) {
            if (activeRole === 'hero') props.onHeroUpload(charFile, charStats, charName || "Hero");
            if (activeRole === 'friend') props.onFriendUpload(charFile, charStats, charName || "Co-Star");
            if (activeRole === 'villain') props.onVillainUpload(charFile, charStats, charName || "Villain");
        }
        
        setCharFile(null);
        setCharName("");
        setCharStats({...defaultStats});
        alert(`${activeRole.toUpperCase()} Saved!`);
    };

    const getRoleData = (role: string) => {
        if (role === 'hero') return props.hero;
        if (role === 'friend') return props.friend;
        if (role === 'villain') return props.villain;
        return null;
    };

    return (
        <>
        <style>{`
             @keyframes knockout-exit {
                0% { transform: scale(1) rotate(1deg); }
                15% { transform: scale(1.1) rotate(-5deg); }
                100% { transform: translateY(-200vh) rotate(1080deg) scale(0.5); opacity: 1; }
             }
             .stat-slider {
                 -webkit-appearance: none;
                 width: 100%;
                 height: 10px;
                 background: #e2e8f0;
                 outline: none;
                 border: 2px solid black;
             }
             .stat-slider::-webkit-slider-thumb {
                 -webkit-appearance: none;
                 appearance: none;
                 width: 25px;
                 height: 25px;
                 background: #facc15;
                 cursor: pointer;
                 border: 3px solid black;
             }
          `}</style>
          
        <div className={`fixed inset-0 z-[200] overflow-y-auto`}
             style={{
                 background: props.isTransitioning ? 'transparent' : 'rgba(0,0,0,0.85)', 
                 backdropFilter: props.isTransitioning ? 'none' : 'blur(6px)',
                 animation: props.isTransitioning ? 'knockout-exit 1s forwards cubic-bezier(.6,-0.28,.74,.05)' : 'none',
                 pointerEvents: props.isTransitioning ? 'none' : 'auto'
             }}>
          <div className="min-h-full flex items-center justify-center p-4">
            <div className="max-w-[700px] w-full bg-white p-6 rotate-1 border-[6px] border-black shadow-[12px_12px_0px_rgba(0,0,0,0.6)] relative">
                
                {/* HEADER */}
                <div className="text-center mb-6">
                    <h1 className="font-comic text-5xl text-red-600 leading-none tracking-wide inline-block mr-2" style={{textShadow: '2px 2px 0px black'}}>INFINITE</h1>
                    <h1 className="font-comic text-5xl text-yellow-400 leading-none tracking-wide inline-block" style={{textShadow: '2px 2px 0px black'}}>HEROES</h1>
                    <div className="flex justify-center gap-4 mt-4 mb-2">
                        <button onClick={() => setStep(1)} className={`font-comic border-2 border-black px-3 py-1 ${step === 1 ? 'bg-black text-white' : 'bg-gray-200'}`}>1. CHARACTERS</button>
                        <button onClick={() => setStep(2)} className={`font-comic border-2 border-black px-3 py-1 ${step === 2 ? 'bg-black text-white' : 'bg-gray-200'}`}>2. ATTRIBUTES</button>
                        <button onClick={() => setStep(3)} className={`font-comic border-2 border-black px-3 py-1 ${step === 3 ? 'bg-black text-white' : 'bg-gray-200'}`}>3. STORY</button>
                    </div>
                </div>

                {/* STEP 1: CHARACTERS */}
                {step === 1 && (
                    <div className="flex flex-col gap-4">
                        <div className="flex gap-2">
                            {['hero', 'friend', 'villain'].map(role => (
                                <button key={role} onClick={() => setActiveRole(role as any)}
                                   className={`flex-1 font-comic p-2 border-4 capitalize text-xl ${activeRole === role ? 'border-blue-500 bg-blue-100' : 'border-black bg-gray-100 hover:bg-gray-200'}`}>
                                    {role} {getRoleData(role) && '✓'}
                                </button>
                            ))}
                        </div>
                        
                        <div className="border-4 border-dashed border-gray-400 p-6 bg-gray-50 flex flex-col items-center">
                            <h2 className="font-comic text-2xl uppercase mb-2">CREATE YOUR {activeRole}</h2>
                            <p className="text-center text-sm text-gray-600 mb-4 font-sans max-w-sm">Capture a face. This defines who appears in your story.</p>
                            
                            <div className="flex gap-4 items-center">
                                {getRoleData(activeRole) && (
                                    <img src={`data:image/jpeg;base64,${getRoleData(activeRole)?.base64}`} alt="Preview" className="w-24 h-24 object-cover border-4 border-black rotate-[-2deg]" />
                                )}
                                <label className="comic-btn bg-yellow-400 text-black text-xl px-6 py-4 cursor-pointer hover:bg-yellow-300 font-comic border-4 border-black">
                                    {getRoleData(activeRole) ? 'REPLACE PHOTO' : 'UPLOAD PHOTO'}
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                        if (e.target.files?.[0]) setCharFile(e.target.files[0]);
                                    }} />
                                </label>
                            </div>
                            {charFile && <p className="text-green-600 mt-2 font-bold">New photo selected. Review Attributes on next step to save.</p>}
                        </div>
                        <div className="flex justify-between mt-4">
                            <button onClick={() => setStep(2)} className="comic-btn bg-black text-white px-6 py-2 uppercase font-comic">Next: Attributes</button>
                        </div>
                    </div>
                )}

                {/* STEP 2: RPG ATTRIBUTES */}
                {step === 2 && (
                    <div className="font-sans">
                        <h2 className="font-comic text-2xl uppercase mb-2">D&D STATS: {activeRole}</h2>
                        <input type="text" placeholder="Character Name" value={charName} onChange={e => setCharName(e.target.value)} 
                           className="w-full border-4 border-black p-3 font-comic text-xl mb-4" />
                        
                        <div className="space-y-4 mb-6">
                            {Object.entries(charStats).map(([stat, val]) => (
                                <div key={stat}>
                                    <div className="flex justify-between font-comic text-lg uppercase mb-1">
                                        <span>{stat}</span>
                                        <span>{val}/10</span>
                                    </div>
                                    <input type="range" min="1" max="10" value={val} 
                                        onChange={e => setCharStats({...charStats, [stat]: parseInt(e.target.value)})}
                                        className="stat-slider" />
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-between">
                            <button onClick={() => setStep(1)} className="comic-btn bg-gray-500 text-white px-4 py-2 font-comic uppercase">BACK</button>
                            <button onClick={saveCharacter} className="comic-btn bg-green-500 text-black px-6 py-2 uppercase font-comic border-2 border-black">Save {activeRole}</button>
                            <button onClick={() => setStep(3)} className="comic-btn bg-black text-white px-6 py-2 uppercase font-comic border-2 border-black">Next: Story</button>
                        </div>
                    </div>
                )}

                {/* STEP 3: STORY */}
                {step === 3 && (
                    <div className="font-sans">
                        <h2 className="font-comic text-2xl uppercase mb-4">World Configuration</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="font-bold uppercase tracking-wider block mb-1">Visual Style (Freeform)</label>
                                <input type="text" value={tempStory.style} onChange={e => setTempStory({...tempStory, style: e.target.value})} 
                                    placeholder="e.g. Gritty Noir, Neon Cyberpunk, 90s Anime" className="w-full border-2 border-black p-2 bg-gray-50" />
                            </div>
                            <div>
                                <label className="font-bold uppercase tracking-wider block mb-1">Setting / World</label>
                                <input type="text" value={tempStory.setting} onChange={e => setTempStory({...tempStory, setting: e.target.value})} 
                                    placeholder="e.g. Abandoned Space Station, Medieval Europe" className="w-full border-2 border-black p-2 bg-gray-50" />
                            </div>
                            <div>
                                <label className="font-bold uppercase tracking-wider block mb-1">Audience / Age Rating</label>
                                <select value={tempStory.audienceAge} onChange={e => setTempStory({...tempStory, audienceAge: e.target.value})} 
                                    className="w-full border-2 border-black p-2 bg-gray-50 cursor-pointer">
                                    <option>Kids (G)</option>
                                    <option>Teen (PG-13)</option>
                                    <option>Mature (R) - Dark Humor / Bittersweet</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="font-bold uppercase tracking-wider block mb-1">Language</label>
                                    <select value={props.selectedLanguage} onChange={e => props.onLanguageChange(e.target.value)} 
                                        className="w-full border-2 border-black p-2 bg-gray-50">
                                        {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    <label className="flex items-center gap-2 cursor-pointer bg-yellow-100 p-2 border-2 border-yellow-300 w-full h-[44px]">
                                        <input type="checkbox" checked={props.richMode} onChange={(e) => props.onRichModeChange(e.target.checked)} className="w-4 h-4 accent-black" />
                                        <span className="text-sm font-bold uppercase">Novel Mode</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        
                        <div className="mt-8 flex gap-4">
                            <button onClick={() => setStep(2)} className="comic-btn bg-gray-500 text-white px-4 py-3 font-comic uppercase border-2 border-black">BACK</button>
                            <button onClick={() => {
                                props.onStorySettingsChange(tempStory);
                                props.onLaunch();
                            }} disabled={!props.hero || props.isTransitioning} 
                            className="comic-btn bg-red-600 text-white text-3xl px-6 py-3 w-full hover:bg-red-500 disabled:bg-gray-400 disabled:cursor-not-allowed uppercase tracking-wider font-comic border-4 border-black">
                                {props.isTransitioning ? 'GENERATING...' : 'ROLL INITIATIVE'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
          </div>
        </div>
        </>
    );
}
