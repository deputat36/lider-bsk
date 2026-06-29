# Public RA Lider header responsiveness fix

Scope: public RA Lider site only.

Do not touch:
- CRM-core business logic;
- Navigator / nav_v2;
- parket contour;
- Supabase schema, data, RLS, grants, policies;
- Supabase Edge Function deploys.

## Problem

The user reported that the top public site menu does not fit and menu text overlaps.

Current state:
- The public header navigation structure is present on `index.html` as `.header .nav`.
- `assets/public-lead-form.css` already contains a small-desktop wrap guard for `@media(max-width:1180px) and (min-width:1025px)`.
- Some public pages still reference `assets/public-lead-form.css?v=3`, while others use `?v=4`.
- PR #99 added a non-blocking GitHub Actions report for the stale/fresh CSS marker split.

## Recommended code fix

Use a normal repository checkout and patch flow, not a direct GitHub contents API rewrite for large/minified files.

Preferred fix:
1. Add a small runtime guard in `assets/public-lead-form.js`.
2. The guard should only run when `.header .nav` exists.
3. The guard should inject a `<style>` tag with id `leader-public-header-guard-v1`.
4. The style should protect the small-desktop range around `1025px` to `1240px`.
5. Call the guard in `init()` before form mounting.

Suggested CSS payload:

```css
@media(max-width:1240px) and (min-width:1025px){
  .header__in{
    flex-wrap:wrap!important;
    min-height:auto!important;
    padding:10px 0 8px!important;
    align-items:center!important;
  }
  .header .brand{flex:0 0 auto!important}
  .header__cta{margin-left:auto!important}
  .header .nav{
    order:3!important;
    display:flex!important;
    flex:0 0 100%!important;
    width:100%!important;
    justify-content:center!important;
    align-items:center!important;
    flex-wrap:wrap!important;
    gap:8px 14px!important;
    padding:0 0 8px!important;
    font-size:14px!important;
    line-height:1.2!important;
  }
  .header .nav a{white-space:nowrap!important}
}
```

Suggested JS structure:

```js
function injectPublicHeaderGuard(){
  if(document.getElementById('leader-public-header-guard-v1'))return;
  if(!document.querySelector('.header .nav'))return;
  const style=document.createElement('style');
  style.id='leader-public-header-guard-v1';
  style.textContent='...minified CSS payload...';
  document.head.appendChild(style);
}
```

Then call:

```js
function init(){
  loadMetrika();
  initClicks();
  injectPublicHeaderGuard();
  document.querySelectorAll('#leader-lead-form,[data-leader-lead-form]').forEach(mount);
  ...
}
```

## Cache marker follow-up

After the runtime guard is merged, update stale public HTML references from:

```html
assets/public-lead-form.css?v=3
```

to:

```html
assets/public-lead-form.css?v=4
```

Known stale references from issue #97:
- `index.html`
- `bannery-borisoglebsk.html`
- `nakleyki-plotternaya-rezka-borisoglebsk.html`
- `outdoor-advertising-borisoglebsk.html`
- `socseti-kontent.html`
- `tablichki-borisoglebsk.html`
- `yandex-karty-2gis.html`

## CI checks

Keep existing checks:
- `node --check assets/public-lead-form.js`;
- `Public site audit check`;
- `Public CSS cache marker report`.

After the code fix, add a marker check for `leader-public-header-guard-v1`.

After the cache marker cleanup, consider turning the stale `?v=3` report from a notice into a failing check for `index.html`.

## Manual QA

After GitHub Pages deploy:
1. Open `https://www.lider-bsk.ru/`.
2. Hard refresh.
3. Test widths: `1025px`, `1100px`, `1180px`, `1240px`.
4. Repeat at browser zoom `110%`.
5. Confirm: logo and phone/button stay in the first row; nav moves to a clean second row; menu text does not overlap.
6. Test mobile width `<=1024px`: nav remains hidden and mobile menu/CTA behavior is unchanged.
