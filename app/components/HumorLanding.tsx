'use client';

import './HumorLanding.css';

import Link from 'next/link';
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

const quips = ['Oh great. Another human. I like you already.', 'Your screen time report is about to get interesting.', 'I followed my dreams. They led me to the snack drawer.', 'Come for the jokes. Stay because you forgot why you opened your phone.'];
const posts = [
  { name: 'Maya', handle: 'mayacontainsmultitudes', avatar: 'M', color: '#efb1c0', category: 'SHOWER THOUGHT', text: 'Being an adult is mostly just saying “after this week things will slow down” until you die.', likes: 248, replies: 32, time: '2h', tag: 'painfully relatable' },
  { name: 'Ben', handle: 'professionallyunserious', avatar: 'B', color: '#c6d4f0', category: 'A SMALL OBSERVATION', text: 'My toxic trait is thinking I can carry every grocery bag in one trip.\n\nI am the bag.', likes: 186, replies: 19, time: '4h', tag: 'one trip or nothing' },
  { name: 'Jules', handle: 'julesofwisdom', avatar: 'J', color: '#efce96', category: 'CURRENT MOOD', text: '“You need to get out of your comfort zone.”\n\nIt took me years to make it comfortable. Absolutely not.', likes: 392, replies: 47, time: '5h', tag: 'protect your peace' },
];

export default function HumorLanding({ children }: { children: ReactNode }) {
  const [quip, setQuip] = useState(quips[0]);
  const [liked, setLiked] = useState<number[]>([]);
  const [burst, setBurst] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const mascot = useRef<HTMLDivElement>(null);
  const counter = useRef(0);
  const reduceMotion = useRef(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { reduceMotion.current = query.matches; };
    change(); query.addEventListener('change', change);
    const move = (event: globalThis.PointerEvent) => {
      if (!mascot.current || reduceMotion.current || event.pointerType === 'touch') return;
      const rect = mascot.current.getBoundingClientRect();
      const dx = event.clientX - rect.left - rect.width / 2;
      const dy = event.clientY - rect.top - rect.height / 2;
      const length = Math.max(1, Math.hypot(dx, dy));
      mascot.current.style.setProperty('--eye-x', `${dx / length * Math.min(9, length / 30)}px`);
      mascot.current.style.setProperty('--eye-y', `${dy / length * Math.min(9, length / 30)}px`);
    };
    window.addEventListener('pointermove', move);
    return () => { window.removeEventListener('pointermove', move); query.removeEventListener('change', change); };
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (burst === null) return; const timer = setTimeout(() => setBurst(null), 650); return () => clearTimeout(timer); }, [burst]);
  function say() { counter.current = (counter.current + 1) % quips.length; setQuip(quips[counter.current]); }
  function explore() { document.getElementById('feed')?.scrollIntoView({ behavior: reduceMotion.current ? 'instant' : 'smooth' }); }
  function tilt(event: PointerEvent<HTMLElement>) {
    if (reduceMotion.current || event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.transform = `perspective(900px) rotateX(${-(event.clientY - rect.top - rect.height / 2) / 80}deg) rotateY(${(event.clientX - rect.left - rect.width / 2) / 80}deg)`;
  }
  function reaction(index: number) { const exists = liked.includes(index); setLiked(exists ? liked.filter(i => i !== index) : [...liked, index]); if (!exists) setBurst(index); }

  return <div className="humor-landing">
    <a className="skip" href="#main">Skip to content</a>
    <header className="header"><Link href="/" className="brand" aria-label="HumorProject home"><span className="brand-mark">h<span>p</span><i /></span>humorproject<span className="brand-period">.</span></Link><nav aria-label="Main navigation"><button className="nav-explore" onClick={explore}>Explore</button><Link className="login" href="/login" onMouseEnter={() => setQuip('Back again? Your productivity had a good run.')} onFocus={() => setQuip('Back again? Your productivity had a good run.')}>Log in</Link><Link className="button small dark" href="/signup">Sign up</Link></nav></header>
    <main id="main">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy"><div className="eyebrow"><span className="tiny-star">✳</span> SERIOUSLY UNSERIOUS.</div><h1 id="hero-title">The internet is<br/>already a joke.<br/><span>Might as well<br className="mobile-break"/> join in.</span><svg className="underline" viewBox="0 0 450 25" aria-hidden="true"><path d="M4 17 Q220 -3 445 12 M35 23 Q210 5 394 19" /></svg></h1><p>A little less doomscroll. A little more LOL.<br/>Find your people. Share your funny.</p><div className="hero-actions"><Link href="/signup" className="button dark" onMouseEnter={() => setQuip('Finally. Someone with questionable judgment.')} onFocus={() => setQuip('Finally. Someone with questionable judgment.')}>Join the chaos<span aria-hidden="true">✳</span></Link><button className="button outline" onClick={explore}>Explore Posts</button></div><div className="social-proof"><div className="avatar-stack"><span>M</span><span>J</span><span>B</span><span>A</span></div><span>A place for your kind of weird.<small>All senses of humor welcome.</small></span></div></div>
        <div className="hero-art"><span className="scribble-note">your new bad influence<svg viewBox="0 0 90 60" aria-hidden="true"><path d="M3 4 Q80 5 55 48 M43 37 L55 49 L69 40" /></svg></span><button className="floating emoji-one" aria-label="Tell me a joke" onClick={say}>😂</button><button className="floating emoji-two" aria-label="Another mischievous quip" onClick={say}>✦</button><button className="floating emoji-three" aria-label="A little more chaos" onClick={say}>🍿</button><div className="mascot-shadow"/><div ref={mascot} className="mascot" role="img" aria-label="A cheerful lime mascot whose eyes follow your cursor"><div className="brow left"/><div className="brow right"/><div className="eyes"><div className="eye"><span/></div><div className="eye"><span/></div></div><div className="cheek left"/><div className="cheek right"/><div className="mouth"><span/></div><div className="arm left"/><div className="arm right"/></div><button className="speech" onClick={say} onMouseEnter={say} onFocus={say}><span className="speech-label">YOUR UNQUALIFIED LIFE COACH</span><span>{quip}</span><small>tap for more questionable wisdom</small></button><div className="mascot-caption">100% judgment. 0% actual judgment.</div></div>
      </section>
      <div className="ticker" aria-label="Community values"><span>GOOD JOKES</span><b>✳</b><span>BAD PUNS</span><b>✳</b><span>YOUR PEOPLE</span><b>✳</b><span>ZERO MAIN CHARACTER REQUIREMENTS</span><b>✳</b><span>GOOD JOKES</span><b>✳</b></div>
      <section id="feed" aria-labelledby="latest-posts-title" className="feed">
        <div className="feed-heading">
          <h2 id="latest-posts-title">Fresh from the community.</h2>
          <p className="feed-note">Newest posts first.</p>
        </div>
        <div className="landing-post-layout">
          <aside className="landing-post-navigation" aria-label="Browse more posts">
            <Link href="/?view=feed" className="view-more-memes">View more memes <span aria-hidden="true">→</span></Link>
          </aside>
          <div className="landing-post-feed">{children}</div>
        </div>
      </section>
    </main>
    <footer><a className="footer-logo" href="#">humorproject.</a><span>Made for laughs. And the occasional nose exhale.</span><span>© 2026 HumorProject</span></footer>
    <div className={`toast ${toast ? 'visible' : ''}`} role="status">{toast}</div>
  </div>;
}
