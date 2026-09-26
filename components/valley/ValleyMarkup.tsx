"use client";

/**
 * The valley's markup: the reference page's DOM (sondaven.com/en, up to its
 * prologue) with Kevin's content. No behaviour lives here; every hook the
 * behaviour needs is a data attribute copied from the reference, so the
 * ported timelines find the same elements they were written for.
 */

import type { JSX } from "react";
import "./valley.css";

/* The reference uses plain (non data-) attributes such as theme="" and
   bg="dark" as JS hooks. React passes unknown lowercase attributes through;
   this spread only keeps TypeScript from checking them as DOM props. */
type Attrs = Record<string, string>;
const attrs = (o: Attrs): Attrs => o;

export type NavItem = { label: string; href: string; external?: boolean };

export const NAV: NavItem[] = [
  { label: "Work", href: "/work" },
  { label: "Info", href: "/info" },
  { label: "GitHub", href: "https://github.com/kevinyhe", external: true },
];

const MAILTO = "mailto:kevin.yuhan.he@gmail.com";

const TRANSITION_COLUMNS = 20;
const TRANSITION_CELLS = 12;

/* ------------------------------------------------------------------------
   Small SVGs
   ------------------------------------------------------------------------ */

/* The reference's four-point star, 8x8. */
function StarIcon() {
  return (
    <svg
      fill="none"
      height="100%"
      viewBox="0 0 8 8"
      width="100%"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        clipRule="evenodd"
        d="M0 4C2.20914 4 4 2.20914 4 0C4 2.20914 5.79086 4 8 4C5.79086 4 4 5.79086 4 8C4 5.79086 2.20914 4 0 4Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

/* One 1.33-unit line of the 32x32 menu icon at the given top edge. */
function MenuLine({ y, inset = 0 }: { y: number; inset?: number }) {
  const x0 = inset;
  const x1 = 32 - inset;
  return (
    <svg
      fill="none"
      height="100%"
      viewBox="0 0 32 32"
      width="100%"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={`M${x0} ${y}H${x1}V${y + 1.33}H${x0}Z`}
        fill="currentColor"
      />
    </svg>
  );
}

/* A five-petal blossom, the mark next to "The Actually Company" where the
   reference had its developer's monogram. 20x20 like the reference's. */
function BlossomMark() {
  const petals = [0, 1, 2, 3, 4].map((k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
    return { cx: 10 + 5.2 * Math.cos(a), cy: 10 + 5.2 * Math.sin(a) };
  });
  return (
    <svg
      fill="none"
      height="100%"
      viewBox="0 0 20 20"
      width="100%"
      xmlns="http://www.w3.org/2000/svg"
    >
      {petals.map((p, i) => (
        <circle
          cx={p.cx.toFixed(3)}
          cy={p.cy.toFixed(3)}
          fill="currentColor"
          key={i}
          r="3.6"
        />
      ))}
      <circle cx="10" cy="10" fill="currentColor" r="2.2" />
    </svg>
  );
}

/* The same blossom on a stem, scanned into vertical bars in the reference
   mark's 88x68 box, so the preloader's corner mark has the bar look of the
   rest of the page. The path was generated once from the petal shape
   (columns 2.8 apart, bars 1.3 wide) and pasted in. */
const LOGO_DIAGRAM_PATH =
  "M21 25H22.3V27.5H21ZM23.8 19H25.1V30H23.8ZM26.6 18.5H27.9V31.5H26.6ZM29.4 19H30.7V32.5H29.4ZM29.4 38H30.7V47.5H29.4ZM32.2 19.5H33.5V33H32.2ZM32.2 34.5H33.5V51H32.2ZM35 20.5H36.3V50H35ZM37.8 10H39.1V48H37.8ZM40.6 6.5H41.9V26H40.6ZM40.6 34H41.9V45H40.6ZM43.4 8.5H44.7V25H43.4ZM43.4 35H44.7V40.5H43.4ZM43.4 44H44.7V64H43.4ZM46.2 6.5H47.5V26H46.2ZM46.2 34H47.5V45H46.2ZM46.2 54H47.5V58H46.2ZM49 10.5H50.3V48H49ZM49 53.5H50.3V58.5H49ZM51.8 20.5H53.1V50H51.8ZM51.8 54H53.1V58H51.8ZM54.6 19.5H55.9V33H54.6ZM54.6 34.5H55.9V51H54.6ZM54.6 55.5H55.9V56.5H54.6ZM57.4 19H58.7V32.5H57.4ZM57.4 38H58.7V47.5H57.4ZM60.2 18.5H61.5V31.5H60.2ZM63 19H64.3V30H63ZM65.8 25H67.1V27.5H65.8Z";

function LogoDiagram() {
  return (
    <svg
      fill="none"
      height="100%"
      viewBox="0 0 88 68"
      width="100%"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={LOGO_DIAGRAM_PATH} fill="currentColor" />
    </svg>
  );
}

/* ------------------------------------------------------------------------
   Wordmark
   ------------------------------------------------------------------------ */

/**
 * "KEVIN HE" as a bar canvas the shader fills, with the serif text behind it
 * as the fallback (shown when the behaviour adds .is-fallback: no WebGL or
 * reduced motion). Aspect 224/24 like the reference's SVG wordmark.
 */
export function Wordmark({ className }: { className?: string }): JSX.Element {
  return (
    <div
      className={["logo", className].filter(Boolean).join(" ")}
      data-wordmark=""
    >
      <canvas />
      <span className="logo_fallback">Kevin He</span>
    </div>
  );
}

/* ------------------------------------------------------------------------
   Nav item and pill button
   ------------------------------------------------------------------------ */

/* Two stacked copies of the label; the hover splits both into characters
   and flips one out while the other comes in. */
function NavLabel({ label }: { label: string }) {
  return (
    <div className="nav-item_label" {...attrs({ hover: "label" })}>
      <div className="nav-item_label_text">
        <div className="p6 text-dark" {...attrs({ hover: "text" })}>
          {label}
        </div>
      </div>
      <div className="nav-item_label_text is-2">
        <div className="p6 text-dark" {...attrs({ hover: "text" })}>
          {label}
        </div>
      </div>
    </div>
  );
}

function NavItem({
  label,
  href,
  external,
}: {
  label: string;
  href: string;
  external?: boolean;
}) {
  return (
    <a
      aria-label={label}
      className="nav-item w-inline-block"
      href={href}
      rel={external ? "noreferrer" : undefined}
      target={external ? "_blank" : undefined}
      {...attrs({ "hover-nav-item": "" })}
    >
      <NavLabel label={label} />
    </a>
  );
}

function PillButton({
  label,
  href,
  small,
}: {
  label: string;
  href: string;
  small?: boolean;
}) {
  return (
    <a
      aria-label={label}
      className={"btn w-inline-block" + (small ? " is-small" : "")}
      href={href}
      {...attrs({ "hover-btn": "" })}
    >
      <div className="btn_label" {...attrs({ hover: "label" })}>
        <div className="btn_label_text">
          <div className="p6 text-light" {...attrs({ hover: "text" })}>
            {label}
          </div>
        </div>
      </div>
      <div className="btn_hover" {...attrs({ hover: "hover" })} />
      <div className="btn_bg" {...attrs({ hover: "bg" })} />
    </a>
  );
}

/* ------------------------------------------------------------------------
   Preloader
   ------------------------------------------------------------------------ */

export function Preloader(): JSX.Element {
  return (
    <>
      <div className="master-preloader" data-master-preloader="" />
      <div className="preloader theme_on-dark" data-preloader="">
        <div className="preloader_c" {...attrs({ preloader: "c" })}>
          <div className="preloader_c_c">
            <div className="preloader_top">
              <div className="u-136" />
              <div className="grid">
                <div className="preloader_top_desc">
                  <div className="logo-diagram text-dark" data-preloader="ctn">
                    <LogoDiagram />
                  </div>
                  <div className="u-32" />
                  <p className="p6 text-dark" data-preloader="p">
                    I write software
                    <br />
                    for things that move
                  </p>
                </div>
              </div>
            </div>
            <div className="preloader_bot">
              <div className="grid">
                <div className="preloader_desc-r">
                  <div className="p6 text-dark a-right" data-preloader="p">
                    Loading the website
                    <br />
                    Please wait
                  </div>
                </div>
                <div className="preloader_desc-l">
                  <div className="p6 text-dark" data-preloader="p">
                    Engineer
                    <br />
                    Toronto — Canada
                  </div>
                </div>
              </div>
              <div className="unit-8" />
              {/* Empty: keeps the bottom space the wordmark (absolutely
                  placed in .preloader_logo) occupies. */}
              <div className="hero-s_content_logo">
                <div className="logo-w" />
              </div>
              <div className="unit-8" />
            </div>
          </div>
        </div>
        <div className="preloader_bg" data-preloader="bg">
          <div className="preloader_bg_c">
            <div className="preloader_bg_scene" data-preloader="scene">
              <canvas className="scene" data-preloader-canvas="" />
              <div className="preloader_bg_scene_label b-mob">
                <div
                  className="p6 text-dark a-center"
                  data-preloader="p"
                  data-preloader-percent=""
                >
                  0%
                </div>
                <div className="p6 text-dark a-center" data-preloader="p">
                  loaded
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="preloader_logo">
          <div className="hero-s_content_logo">
            <div className="logo-w">
              <div className="logo-w theme_on-dark" data-preloader="logo">
                <Wordmark />
              </div>
            </div>
          </div>
          <div className="unit-8" />
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------
   Transition grid and noise
   ------------------------------------------------------------------------ */

export function TransitionGrid(): JSX.Element {
  const columns = Array.from({ length: TRANSITION_COLUMNS }, (_, i) => i);
  const cells = Array.from({ length: TRANSITION_CELLS }, (_, i) => i);
  return (
    <div className="transition">
      <div className="transition_over" />
      {columns.map((c) => (
        <div className="transition_column" key={c}>
          {cells.map((r) => (
            <div className="transition_cell" key={r} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Noise(): JSX.Element {
  return <div className="noise" data-noise="" />;
}

/* ------------------------------------------------------------------------
   Header
   ------------------------------------------------------------------------ */

export function Header({ nav = NAV }: { nav?: NavItem[] } = {}): JSX.Element {
  const [work, info, github] = nav;
  return (
    <nav
      className="header"
      data-prevent-flicker="true"
      {...attrs({ header: "", theme: "" })}
    >
      <div className="container">
        <div className="header_c">
          <div className="header_left">
            {/* The reference's menu button opens a modal; ours is the "Work"
                link. The icon and the label share one anchor, and the hover
                listens on the trigger so the lines light the label too. */}
            <a
              aria-label={work.label}
              className="menu-btn"
              href={work.href}
              {...attrs({ "hover-nav-item-trigger": "" })}
            >
              <div className="menu-btn_ico b-desk">
                <div className="menu-btn_ico_line top">
                  <MenuLine y={11} />
                </div>
                <div className="menu-btn_ico_line bot">
                  <MenuLine y={19.67} />
                </div>
              </div>
              <div className="menu-btn_ico b-mob">
                <div className="mob_menu-btn_ico_line top">
                  <MenuLine inset={2} y={8.33} />
                </div>
                <div className="mob_menu-btn_ico_line center">
                  <MenuLine inset={2} y={15.33} />
                </div>
                <div className="mob_menu-btn_ico_line bot">
                  <MenuLine inset={2} y={22.33} />
                </div>
              </div>
              {/* f-desk: the reference hides the word beside the icon below
                  992 and shows the icon alone. The anchor keeps its
                  aria-label, so the icon-only button still says where it
                  goes. */}
              <div className="menu-btn_label-w f-desk">
                <div className="menu-btn_label">
                  <div
                    className="nav-item w-inline-block"
                    {...attrs({ "hover-nav-item": "" })}
                  >
                    <NavLabel label={work.label} />
                  </div>
                </div>
              </div>
            </a>
            <div className="b-desk">
              <NavItem href={info.href} label={info.label} />
            </div>
          </div>
          <div className="header_center">
            <a aria-label="Kevin He" className="header_logo" href="#hero">
              <Wordmark />
            </a>
          </div>
          <div className="header_right">
            <div className="b-desk">
              <NavItem
                external={github.external}
                href={github.href}
                label={github.label}
              />
            </div>
            <div className="b-desk">
              <PillButton href={MAILTO} label="Write to me" small />
            </div>
          </div>
        </div>
      </div>
      <div className="header_bg f-mob">
        <div
          className="divider"
          data-prevent-flicker="true"
          data-scroll-reveal="line"
          {...attrs({ hover: "line" })}
        >
          <div className="line-l" {...attrs({ hover: "line-l" })} />
          <div className="line-s" />
        </div>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------------
   Hero
   ------------------------------------------------------------------------ */

function HeroOverlays() {
  return (
    <>
      <div className="over-gradient-top" />
      <div className="over-gradient-bot" />
      <div className="over" />
    </>
  );
}

function CircleButton({ label, href }: { label: string; href: string }) {
  return (
    <a
      aria-label={label}
      className="btn-circle w-inline-block"
      data-magnetic-strength=""
      href={href}
    >
      <div className="btn-circle_bg" />
      <div className="btn-circle_label" data-magnetic-inner-target="">
        <div className="btn-circle_label_text">
          <div className="p6 text-dark" {...attrs({ hover: "text" })}>
            {label}
          </div>
        </div>
      </div>
    </a>
  );
}

export function Hero(): JSX.Element {
  return (
    <section className="section theme_on-dark clip" id="hero">
      <div className="container">
        <div className="hero-scroll-area" data-scroll-video-container="">
          {/* Phone: one static frame of the scene, sticky behind the text. */}
          <div className="mob_hero-w_bg b-mob">
            <div className="mob_hero-w_bg_img">
              <div className="img-w">
                <canvas className="hero-img" data-hero-img="" />
              </div>
            </div>
            <HeroOverlays />
          </div>
          <div className="hero-w">
            <div className="hero-s">
              <div className="grid">
                <div className="hero-s_content">
                  <div className="grid _10-columns">
                    <div className="hero-s_content_title">
                      <h1 className="p3 text-dark a-center" data-intro="p">
                        software for things that move
                      </h1>
                    </div>
                  </div>
                  <div className="u-72" />
                  <div className="hero-s_content_logo">
                    <div
                      className="logo-w"
                      {...attrs({ preloader: "logo-w-finish" })}
                    >
                      <div
                        className="hero-s_content_logo_c"
                        {...attrs({ preloader: "logo-static" })}
                      >
                        <Wordmark />
                      </div>
                    </div>
                  </div>
                  <div className="u-72" />
                  <div className="grid _10-columns" data-intro="ctn">
                    <div className="hero-s_content_info-l">
                      <p className="p5 text-dark">Co‑founder and CTO</p>
                      <div className="p6-list">
                        <div className="hero-s_content_info-l_logo">
                          <div className="ico-20">
                            <div className="blossom-mark text-dark">
                              <BlossomMark />
                            </div>
                          </div>
                        </div>
                        <p className="p5 text-dark">The Actually Company</p>
                      </div>
                    </div>
                    <div className="hero-s_content_info-c b-desk">
                      <h2 className="p5 text-dark a-center">
                        Computer engineering
                        <br />
                        University of Toronto
                      </h2>
                    </div>
                    <div className="hero-s_content_info-r">
                      <p className="p5 text-dark a-right">
                        Toronto,
                        <br />
                        Ontario
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="hero-s_btn" data-intro="ctn">
                <CircleButton href={MAILTO} label="Write to me" />
              </div>
            </div>
            {/* Desktop: the live hut scene, scrubbed by scroll. */}
            <div className="hero-w_bg b-desk" data-intro="video">
              <div className="img-w">
                <canvas className="scroll-video" data-scroll-video="" />
              </div>
              <HeroOverlays />
            </div>
          </div>
          <div className="hero-w_scene-over">
            <div className="hero-w_scene-over_c">
              <canvas className="scene" data-intro-over-scene="" />
            </div>
          </div>
          <div className="hero-w_scene-bg b-desk">
            <canvas className="scene" data-intro-bg-scene="" />
          </div>
          {/* Bands the header's theme follows as they cross its centre. */}
          <div className="hero_themes">
            <div className="hero_themes_dark-1" {...attrs({ bg: "dark" })} />
            <div className="hero_themes_light-1" {...attrs({ bg: "light" })} />
            <div className="hero_themes_dark-2" {...attrs({ bg: "dark" })} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------
   Prologue
   ------------------------------------------------------------------------ */

function TitleStars() {
  return (
    <div className="title_stars text-dark">
      {[0, 1, 2].map((i) => (
        <div className="ico-8-12" key={i}>
          <div className="ico">
            <StarIcon />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Set in the display serif, so it must avoid the DEMO cut's watermark
   characters (' " & - ( ) etc.); the curly quotes are safe. */
const QUOTE =
  "“Lack of originality, everywhere, all over the world, from time immemorial, has always been considered the foremost quality and the recommendation of the active, efficient and practical man.”";

export function Prologue(): JSX.Element {
  return (
    <section
      className="section bg-light theme_on-dark"
      id="prolog"
      {...attrs({ bg: "dark" })}
    >
      <div className="container">
        <div className="prolog-w">
          <div className="prolog-s">
            <div className="grid fill">
              <div className="about-s_content">
                <div className="u-136" />
                <div className="title" data-scroll-reveal="ctn">
                  <TitleStars />
                  <h2 className="p6 text-dark a-center">prologue</h2>
                  <TitleStars />
                </div>
                <div className="u-32" />
                <div className="about-s_content_lead">
                  <h3
                    className="h5 text-dark a-center text-pretty"
                    data-highlight-text=""
                    data-scroll-reveal="h"
                  >
                    {QUOTE}
                  </h3>
                </div>
                <div className="u-32" />
                {/* Where the reference had its PDF button: the attribution,
                    a plain line, not a button. */}
                <div className="btn-list" data-scroll-reveal="ctn">
                  <p className="p6 text-dark a-center">
                    Fyodor Dostoevsky, The Idiot
                  </p>
                </div>
                <div className="u-48" />
              </div>
            </div>
          </div>
          <div
            className="prolog-w_scene b-desk"
            {...attrs({ parallax: "ctn-down" })}
          >
            <canvas className="scene" data-prolog-scene="" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------
   The whole static page, in the reference's order
   ------------------------------------------------------------------------ */

export function ValleyStatic(): JSX.Element {
  return (
    <div className="valley">
      <Preloader />
      <TransitionGrid />
      <Noise />
      {/* The reference wraps its header in a themed container; the header's
          own [theme] class then overrides it as the page scrolls. */}
      <div className="theme_on-dark">
        <Header />
      </div>
      <Hero />
      <Prologue />
    </div>
  );
}

/** Where the home page's header points: two sections of this page, then out. */
export const HOME_NAV: NavItem[] = [
  { label: "Work", href: "#work" },
  { label: "Info", href: "#info" },
  { label: "GitHub", href: "https://github.com/kevinyhe", external: true },
];

/**
 * The same intro and hero WITHOUT the prologue, on the site's own ground
 * (valley--ink), for the home page: the reference's opening runs straight
 * into the narration, the work and the contact plate instead of closing on
 * a quote. The behaviour is the same module — it skips the prologue scene
 * on its own when the canvas is not there.
 */
export function ValleyIntroHome(): JSX.Element {
  return (
    <div className="valley valley--ink">
      <Preloader />
      <TransitionGrid />
      <Noise />
      <div className="theme_on-dark">
        <Header nav={HOME_NAV} />
      </div>
      <Hero />
    </div>
  );
}
