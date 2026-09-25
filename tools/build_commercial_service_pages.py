#!/usr/bin/env python3
"""Render static commercial pages from authored copy and the shared service registry."""
from pathlib import Path
from html import escape as esc
import json,re,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
registry=json.loads(subprocess.check_output(['node','--input-type=module','-e',"await import('./assets/leader-service-catalog.js'); console.log(JSON.stringify(globalThis.LeaderServiceCatalog));"],cwd=ROOT,text=True))
services={s['id']:s for s in registry['services']}
copy=json.loads((ROOT/'data/commercial-services.json').read_text())
reference=(ROOT/'vyveski-borisoglebsk.html').read_text()
header=re.search(r'<a class="skip-link".*?<main id="main">',reference,re.S).group(0)
footer=re.search(r'<footer class="service-footer">.*?</footer>',reference,re.S).group(0)
origin='https://www.lider-bsk.ru/'
def e(value):return esc(str(value),quote=True)
def render(p):
 s=services[p['id']];name=s['pages'][0];url=origin+name;title=p['title']+' | РА Лидер';description=p['lead'];direction=registry['directions'][s['direction']]
 ld={'@context':'https://schema.org','@graph':[{'@type':'WebPage','@id':url+'#webpage','url':url,'name':p['title'],'description':description,'inLanguage':'ru-RU','isPartOf':{'@id':origin+'#website'}},{'@type':'Service','@id':url+'#service','name':s['label'],'serviceType':s['label'],'description':description,'url':url,'provider':{'@type':'LocalBusiness','@id':origin+'#business','name':'РА Лидер','url':origin,'telephone':'+79802457471','email':'zakaz@lider-bsk.ru'},'areaServed':['Борисоглебск','Воронежская область']},{'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Главная','item':origin},{'@type':'ListItem','position':2,'name':'Услуги','item':origin+'uslugi.html'},{'@type':'ListItem','position':3,'name':s['label'],'item':url}]}]}
 formats=''.join(f'<article class="card"><h3>{e(a)}</h3><p>{e(b)}</p><p class="muted">{e(c)}</p></article>' for a,b,c in p['formats'])
 includes=''.join(f'<li>{e(x)}</li>' for x in p['includes']);estimate=''.join(f'<li>{e(x)}</li>' for x in p['estimate'])
 steps=''.join(f'<li><h3>{e(a)}</h3><p>{e(b)}</p></li>' for a,b in p['steps'])
 faqs=''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q,a in p['faq'])
 related=''.join(f'<a href="{e(services[id]["pages"][0])}">{e(services[id]["label"])}</a>' for id in p['related'])
 demo=p['demo'];cards=''.join(f'<div class="demo-card"><span>{i:02d}</span><h3>{e(a)}</h3><p>{e(b)}</p></div>' for i,(a,b) in enumerate(demo['cards'],1))
 return f'''<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(description)}">
<meta name="robots" content="index, follow"><link rel="canonical" href="{url}">
<meta property="og:type" content="website"><meta property="og:locale" content="ru_RU"><meta property="og:site_name" content="РА Лидер">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(description)}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{origin}assets/og-lider-default.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="РА Лидер — рекламное агентство в Борисоглебске">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{e(title)}"><meta name="twitter:description" content="{e(description)}"><meta name="twitter:image" content="{origin}assets/og-lider-default.png">
<link rel="stylesheet" href="assets/public-lead-form.css?v=5"><link rel="stylesheet" href="assets/public-simple-service.css?v=6"><link rel="stylesheet" href="assets/public-commercial-services.css?v=1">
<script type="application/ld+json">{json.dumps(ld,ensure_ascii=False,separators=(',',':'))}</script>
</head><body class="page-service-modern page-commercial-service" data-commercial-service="{e(s['id'])}">
{header}
<section class="hero"><div class="wrap"><a class="back" href="uslugi.html">Все услуги</a><p class="commercial-direction">{e(direction)}</p><h1>{e(p['title'])}</h1><p>{e(description)}</p><div class="service-actions"><a class="btn" href="#request">Обсудить задачу</a><a class="service-secondary" href="#formats">Выбрать вариант</a></div><p class="service-note">Начать можно с описания задачи — готовое техническое задание не требуется.</p></div></section>
<section class="section" id="formats"><div class="wrap"><h2>Выберите подходящий вариант</h2><p>{e(p['audience'])}</p><div class="grid service-formats">{formats}</div></div></section>
<section class="section soft"><div class="wrap service-estimate"><div><h2>Что входит в работу</h2><ul class="commercial-includes">{includes}</ul></div><div><h3>Состав согласуем заранее</h3><p>В расчёте будут понятны результат, объём работ и отдельные дополнительные позиции. Дату и стоимость подтвердим после уточнения задачи.</p><a href="#request">Подобрать состав для меня</a></div></div></section>
<section class="section" id="demo"><div class="wrap"><div class="commercial-demo"><p class="demo-label">Демонстрационный пример</p><h2>{e(demo['title'])}</h2><p>{e(demo['task'])}</p><div class="demo-grid">{cards}</div><p class="demo-caption">{e(demo['note'])} Не является выполненным проектом.</p><a href="#request">Обсудить похожую задачу</a></div></div></section>
<section class="section soft" id="estimate"><div class="wrap service-estimate"><div><h2>Что нужно для расчёта</h2><p>Достаточно короткого описания и телефона. Если подробности пока неизвестны, уточним их вместе.</p><details class="service-details"><summary>Какие подробности помогут</summary><ul>{estimate}</ul><p>Фото и файлы можно передать при обсуждении заказа.</p></details></div><div><h3>От чего зависит стоимость</h3><p>{e(p['price'])}</p><a href="#request">Обсудить мой вариант</a></div></div></section>
<section class="section"><div class="wrap"><h2>Как будем работать</h2><ol class="service-steps">{steps}</ol></div></section>
<section class="section soft" id="questions"><div class="wrap"><h2>Частые вопросы</h2><div class="service-questions">{faqs}</div></div></section>
<section class="section"><div class="wrap"><h2>Дополнить решение</h2><nav class="service-related" aria-label="Связанные услуги">{related}</nav></div></section>
<section class="section" id="request"><div class="wrap"><div class="cta"><div><h2>Обсудим вашу задачу</h2><p>Выбранная услуга: {e(s['label'])}. Опишите желаемый результат и оставьте телефон. Уточним детали и подготовим расчёт.</p><p><strong>Телефон:</strong> <a href="tel:+79802457471">8 980 245-74-71</a></p></div><div id="leader-lead-form"></div></div></div></section>
</main>{footer}
<script src="assets/packages-link.js?v=2" defer></script><script src="assets/leader-service-catalog.js?v=1"></script><script src="assets/public-lead-form.js?v=30"></script>
</body></html>
'''
errors=[]
for page in copy:
 target=ROOT/services[page['id']]['pages'][0];result=render(page)
 if '--check' in sys.argv:
  if not target.exists() or target.read_text()!=result:errors.append(target.name)
 else:target.write_text(result)
if errors:raise SystemExit('Generated pages differ from their sources: '+', '.join(errors))
print(f'Commercial pages {"verified" if "--check" in sys.argv else "generated"}: {len(copy)}')
