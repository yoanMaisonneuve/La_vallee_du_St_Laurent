# Index — `Institut St-Laurent · Direction stratégique AGI-1.html`

Snapshot au **2026-04-20** · ~6365 lignes · single-file HTML + CSS + JS inline.
**Règle** : toute modification de structure (section ajoutée, bloc CSS déplacé, handler JS renommé) doit être refletée ici en fin de session.

---

## 1 · En-tête `<head>` (L1–L45)

| Bloc | Lignes |
|---|---|
| Meta SEO + Open Graph | L3–L20 |
| JSON-LD Organization | L21–L34 |
| Three.js importmap (esm.sh) | L35–L42 |
| Preconnect + Google Fonts (IBM Plex, Space Grotesk, Source Serif 4, JetBrains Mono) | L43–L45 |

---

## 2 · CSS `<style>` (L46–L3190)

### 2.1 Tokens & base

| Bloc | Lignes |
|---|---|
| `:root` (tokens couleur, ombres, `--content`) | L47–L75 |
| `body` + texture `body::before` | L76–L185 |
| `.nav-shell` + `.nav-links` + `.nav-cta` | L187–L300 |

### 2.2 Hero + composants marine (Registre A)

| Bloc | Lignes |
|---|---|
| `.hero`, `.glass-panel`, `.hero-copy`, `.hero-actions`, `.hero-meta`, `.hero-stage` | L303–L464 |
| WebGL layers | L465–L495 |
| Canvas nuage + HUD hero | L565–L620 |
| `.briefing-*`, `.cluster-*`, `.timeline-*`, `.chassis-*` base, `.map-*`, `.asset-*`, `.video-*`, `.governance-*`, `.download-list`, `.contact-form`, `.cta-card`, `.footer-*` | L620–L1423 |
| **Chassis HUD polish** (scan-lines, corner brackets, sweep, joint breathe, highlight pulse, layer-btn underline, live-dot) | L1425–L1555 |

### 2.3 Polish marqueurs (composant par composant, registres A et B)

| Marqueur | Ligne | Cible |
|---|---|---|
| `/* ── Briefing polish ── */` | **L941** | `.briefing-shell`, `.decision-card` (numéro ghost, dot pulsant, métric ▸), `.briefing-stat` accent vertical |
| `/* ── #agi polish ── */` | **L1333** | `.cluster-panel` scan-lines, `.timeline-shell::after` corner brackets, `.timeline-item` `[T+0N]` mono, `.timeline-focus-stat` accent |
| `/* ── #corridor polish ── */` | **L1923** | `.map-panel` corner brackets, `.map-hotspot` ping, `.map-inspector-kicker` `· LIVE NODE` |
| `/* ── #about polish ── */` | **L2471** | `.governance-card` numéro ghost + `§` kicker mono, `.disclosure-note` `⚐` |
| `/* ── Nouveaux composants ── */` | **L2401** | (marqueur historique) |

### 2.4 Footer-meta polish (colophon)

| Bloc | Lignes |
|---|---|
| `/* ── Footer-meta polish (colophon style) ── */` | **L2712** |
| `.footer-meta::before` `— COLOPHON —`, `> div::before` `§ 0N`, h4 mono | L2713–L2770 |

### 2.5 Vallée — Rendu 3D WebGL (Three.js)

| Bloc | Lignes |
|---|---|
| Marqueur `/* ── Vallée ── */` | ~L2778 |
| `.valley-strip` (height 420px, corner brackets `::before`, scan-lines `::after`) | — |
| `.valley-webgl-layer` (mount Three.js `inset: 0`) | — |
| `.valley-hud` (4 coins : tl/tr/bl/br) + `.valley-hud-dot` keyframe `valleyHudDot` | — |
| `.valley-caption*` (eyebrow mono + title serif) | — |
| Média 1120px → 320px · 720px → 280px | — |

### 2.6 Partenaires — Bande institutionnelle

| Bloc | Lignes |
|---|---|
| Marqueur `/* ── Partenaires ── */` | ~L2832 |

### 2.7 Registre B — Papier / Rapport académique

| Bloc | Lignes |
|---|---|
| Marqueur `/* ── Registre B ── */` | ~L2939 |
| `/* ── #risques polish (registre B / academic marginalia) ── */` | **L3267** — `.risk-card::before` numéro romain + `▲` + `↳` mitigation |
| `.section.register-b.is-spotlit` + média ≤1120px | — |

### 2.7 Registre C — Terminal / Monochrome

| Bloc | Lignes |
|---|---|
| Marqueur `/* ── Registre C ── */` | **L2661** |
| `.register-divider.register-c-divider` + kicker `▸` + meta | L2662–L2711 |
| `.section.register-c` (scanlines, top dashed trace) | L2713–L2737 |
| Section-head `// eyebrow`, h2, p | L2739–L2773 |
| Video-player-shell + video-selector | L2775–L2850 |
| CTA-grid + cta-card `data-slot` | L2852–L2892 |
| Download-list (mono rows, `↓` hover) | L2894–L2941 |
| Contact-form + submit `→` | L2943–L3013 |
| `.is-spotlit` + média ≤1120px | L3015–L3045 |

### 2.8 Préférences utilisateur

| Bloc | Lignes |
|---|---|
| `@media (prefers-reduced-motion)` | L3047–L3085 |
| Fin `</style>` | **L3190** |

---

## 3 · HTML `<body>` (L3192–L4388)

### 3.1 Nav + hero + main wrapper

| Élément | Ligne | Notes |
|---|---|---|
| `.progress-rail` | L3195 | — |
| `.nav-shell` | L3199 | liens à L3201–L3208 (8 entrées avec `#partenaires`) |
| `<main id="top">` | L3221 | — |
| `<section class="hero">` | L3222 | — |

### 3.2 Sections principales (dans l'ordre de rendu)

| Section / élément | Ligne | Registre | Classe |
|---|---|---|---|
| **Vallée strip** (mount WebGL + 4 HUDs) | L4001 | A (signature) | `valley-strip` |
| `#briefing` | L4080 | A | `glass-panel` |
| `#stack` | L4158 | B | `register-b` |
| `#agi` | L4203 | A | `glass-panel` |
| `#robotique` (chassis SVG + internals) | L4328 | A | `glass-panel` |
| `#corridor` (map Terman) | L4668 | A | `glass-panel` |
| `#assets` | L4762 | A | `glass-panel` |
| `#mediatheque` | L4801 | **C** | `register-c` |
| `#about` | L4837 | A | `glass-panel` |
| `#partenaires` (10 wordmarks SVG) | **L4884** | A | `glass-panel` `partners-band` |
| `#risques` | L5018 | B | `register-b` |
| `#contact` | L5103 | **C** | `register-c` |

### 3.3 Footer

| Élément | Ligne |
|---|---|
| `.footer-meta` (sources, méthodo, transparence) | L5181 |
| `<footer class="footer">` | L5200 |

---

## 4 · JavaScript `<script>` (L4390–L5090)

### 4.1 Sélections DOM (en tête de script)

Listes : `progressBar`, `revealNodes`, `clusterGrid`, `timelineItems`, `timelineFocus*`, `mapHotspots`, `nodeTriggerButtons`, `islVideo`, `islVideoSource`, `videoSelectorBtns`, `langButtons`, `navLinks`, `robotFocusCards`, `heroCommand*`, `heroScene*`, `briefingCards`, `briefingNote*`, `timelineScene*`.

### 4.2 Données statiques

| Donnée | Notes |
|---|---|
| `robotFocusData` | prototype/cadence/terrain |
| `briefingData` | compute / robotique / coopération |
| `mapData` | 6 nœuds corridor |
| `chassisData` | 8 zones chassis robot |

### 4.3 Handlers principaux

`pulseCluster`, `revealObserver`, `setTimelineFocus`, `setRobotFocus`, `setBriefingFocus`, `setChassisZone`, `clearChassisZone`, `setChassisLayer`, `setMapFocus`, `switchVideo`, `applyLang`, `updateProgress`, `sectionObserver`, `resizeCanvas`, `buildParticles`, `rotatePoint`, `drawCore`, `resetScene`.

### 4.4 i18n dictionnaire (L4812–L4834)

Clés FR/EN : `nav.stack`, `nav.agi`, `nav.robotique`, `nav.corridor`, `nav.media`, `nav.about`, `nav.partners` (NEW), `nav.risks`, `nav.cta`.

---

## 5 · Conventions & protocoles

- **Anchors footnotes** : `id="fn-N"` (cible) + `id="fn-N-ref"` (source) + `.backref` avec `↩`.
- **Folio** registre B : `§ I · p. 01/02`, `§ II · p. 02/02`.
- **Channel** registre C : `CH · III / IV`, `CH · IV / IV`.
- **Partenaires** : status-dot → `.is-active` = dialogue formel · vide = pressenti. Disclaimer typographique obligatoire (`.partners-header-note`) pour éviter prétention d'endossement.
- **i18n** : entrées `data-i18n` bilingues (nav + CTA). Body copy = FR uniquement (pending).
- **Largeur** : tous les `.section*`, `.register-divider`, `.valley-strip` → `width: var(--content)`.
- **Police** : A = IBM Plex Sans ; B = Source Serif 4 ; C = JetBrains Mono + Space Grotesk.

---

---

## 5bis · `three-scenes.js` (723 lignes · module ES)

| Scène | Lignes | Mount |
|---|---|---|
| `addHeroScene` | L45–~L220 | `#hero-webgl` |
| `addRobotScene` | ~L220–~L320 | `#robot-webgl` |
| `addTimelineScene` | ~L320–~L370 | `#timeline-webgl` |
| **`addValleyScene`** | **L370–~L655** | **`#valley-webgl`** |
| `scenes.push(...)` + boucle RAF | L658–L723 | — |

### 5bis.1 Vallée — constantes clés

| Bloc | Notes |
|---|---|
| `CENTER_LON = -71.5`, `CENTER_LAT = 47.2` | recentrage scène |
| `project(lat, lon)` | equirectangular → XZ |
| `RIVER_COORDS` | 27 pts Kingston ON → Havre-Saint-Pierre |
| `NORTH_SHORE` / `SOUTH_SHORE` | 17 + 21 pts stipple |
| `NODES` | 6 villes (ottawa, montreal, rive-nord, trois-rivieres, quebec, sherbrooke) |
| TubeGeometry × 2 | core 0.035 + halo 0.12 (AdditiveBlending) |
| Beam ShaderMaterial | vertFade · horzFade · pulse · drip (crossed planes 90°) |
| Particles | 500 stars + 180 rain |
| Camera sweep | `x = 0.4 + sin(time*0.11)*0.55` |

---

## 6 · Chantiers ouverts

- [ ] Traduction EN du body (actuellement nav seule)
- [ ] Panneau SVG cluster H100 (dans `#agi`) — optionnel
- [x] ~~Upgrade chassis robot — internals + CAD rulers + labels bracketés~~ ✓ 2026-04-20
- [x] ~~Polissage canalisé composant par composant : Briefing / #agi / #corridor / #about / #risques / Footer-meta~~ ✓ 2026-04-20
- [x] ~~Passe v2 sur les 6 polish (sous-marqueurs `/* — v2 — */` dans chaque bloc) : timestamp briefing, cluster capacity badge, scan sweep map, drop-cap about, watermark `ANALYSE` + jauge sévérité risques, monogramme `◐ ISL ◑` + cropmarks footer~~ ✓ 2026-04-20
- [x] ~~Vallée 3D WebGL : refonte `.valley-strip` avec topographie réelle Saint-Laurent (27 pts centerline Kingston→Golfe, stipple 2 côtes, 6 beams villes, arcs de connexion, starfield + pluie, HUD 4 coins, caméra en oscillation)~~ ✓ 2026-04-20
