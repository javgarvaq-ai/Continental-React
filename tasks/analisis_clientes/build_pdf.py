# PDF 2 hojas (lee df.pkl, k.pkl, rec.pkl, r.pkl; necesita logo.png = recorte del logotipo y playwright)
# Ajustar a mano: textos de conclusiones, MES y fechas del periodo.
import pandas as pd, base64, re, unicodedata
df=pd.read_pickle('df.pkl'); k=pd.read_pickle('k.pkl'); rec=pd.read_pickle('rec.pkl').set_index('mes'); r=pd.read_pickle('r.pkl')
MES={'2026-06':'Jun*','2026-07':'Jul','2026-08':'Ago','2026-09':'Sep','2026-10':'Oct*'}; MS=list(MES)
f=lambda v:'$'+format(round(v),',')
fd=lambda d:f"{d.day}-{['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][d.month-1]}"
LAST=pd.Timestamp('2026-10-17').date()
kc=df[df.tipo=='Conocido']
d=kc.groupby('cliente').dia.nunique(); recset=set(d[d>=2].index)
df['grupo']=['Gen' if t=='Genérico' else ('Rec' if c in recset else 'Uno') for t,c in zip(df.tipo,df.cliente)]
gx=df.pivot_table(index='mes',columns='grupo',values='final_total',aggfunc='sum',fill_value=0)
pct_rec=(gx.Rec/gx.sum(axis=1))
logo=base64.b64encode(open('logo.png','rb').read()).decode()
# ---- page 1 table
rows=''
for m in MS:
    a=k.loc[m]; rc=rec.loc[m]
    rows+=f"<tr><td>{MES[m]}</td><td>{int(a.dias)}</td><td>{int(a.cuentas)}</td><td>{a.cuentas_dia:.1f}</td><td>{f(a.venta_dia)}</td><td>{f(a.ticket)}</td><td>{pct_rec[m]*100:.0f}%</td><td>{int(rc.activos)}</td><td>{int(rc.nuevos)}</td><td>{int(rc.regresan)}</td></tr>"
# ---- svg 3-stack
W,H,pad=300,150,24; vmax=6400; bw=34; gap=(W-pad-5*bw)/5; bars=''
for i,m in enumerate(MS):
    dd=k.loc[m].dias; parts=[(gx.loc[m,'Rec']/dd,'#2a78d6'),(gx.loc[m,'Uno']/dd,'#85b7eb'),(gx.loc[m,'Gen']/dd,'#b4b2a9')]
    x=pad+gap/2+i*(bw+gap); y=H-18; tot=0
    for j,(v,c) in enumerate(parts):
        h=v/vmax*(H-30); y-=h; bars+=f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw}" height="{max(h-1.5,0):.1f}" {"rx=3" if j==2 else ""} fill="{c}"/>'; tot+=v
    bars+=f'<text x="{x+bw/2:.1f}" y="{y-4:.1f}" text-anchor="middle" font-size="8.5" fill="#2b2925">{f(tot)}</text><text x="{x+bw/2:.1f}" y="{H-5}" text-anchor="middle" font-size="8.5" fill="#7a776f">{MES[m]}</text>'
svg=f'<svg viewBox="0 0 {W} {H}" width="100%"><line x1="{pad}" x2="{W}" y1="{H-18}" y2="{H-18}" stroke="#c3c2b7"/>{bars}</svg>'
# ---- top 30
g=kc.groupby('cliente').agg(venta=('final_total','sum'),cuentas=('folio','count'),dias=('dia','nunique'),primera=('dia','min'),ultima=('dia','max'))
pv=kc.pivot_table(index='cliente',columns='mes',values='final_total',aggfunc='sum',fill_value=0)
def norm(s):
    s=unicodedata.normalize('NFD',str(s)).encode('ascii','ignore').decode().lower(); return re.sub(r'\s+',' ',re.sub(r'[^a-z0-9 ]',' ',s)).strip()
def aliases(c):
    sub=kc[kc.cliente==c]; names=sorted({norm(x) for x in sub.customer_name.dropna()}-{norm(c)})
    s=', '.join(names)
    if sub.customer_number.notna().any(): s=('registrado #'+str(int(sub.customer_number.dropna().iloc[0]))+(' · ' if s else ''))+s
    return s if len(s)<=58 else s[:56]+'…'
def estado(u):
    n=(LAST-u).days
    return ('Activo','ok') if n<=14 else (('Enfriándose','warn') if n<=30 else ('Perdido','bad'))
top=g.sort_values('venta',ascending=False).head(30); t30=''
for i,(c,a) in enumerate(top.iterrows(),1):
    e=estado(a.ultima)
    cells=''.join(f"<td>{f(pv.loc[c,m]) if pv.loc[c,m] else '<span class=z>–</span>'}</td>" for m in MS)
    t30+=f"<tr><td class=n>{i}</td><td class=l><b>{c}</b> <span class=al>{aliases(c)}</span></td>{cells}<td><b>{f(a.venta)}</b></td><td>{a.cuentas}</td><td>{a.dias}</td><td>{fd(a.ultima)}</td><td class='l st {e[1]}'>{e[0]}</td></tr>"
share30=top.venta.sum()/df.final_total.sum()
# ---- emerging
pvd=kc.pivot_table(index='cliente',columns='mes',values='dia',aggfunc='nunique',fill_value=0)
em=g[(g.primera>=pd.Timestamp('2026-08-01').date())&(g.dias>=3)].sort_values(['dias','venta'],ascending=False)
te=''
for c,a in em.iterrows():
    e=estado(a.ultima)
    te+=f"<tr><td class=l><b>{c}</b></td><td>{fd(a.primera)}</td><td>{pvd.loc[c,'2026-08']} / {pvd.loc[c,'2026-09']} / {pvd.loc[c,'2026-10']}</td><td>{f(a.venta)}</td><td>{f(a.venta/a.cuentas)}</td><td>{fd(a.ultima)}</td><td class='l st {e[1]}'>{e[0]}</td></tr>"
CSS='''@page{size:letter;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Inter,sans-serif;color:#2b2925;font-size:9.6px;line-height:1.42}
.pg{width:8.5in;height:11in;position:relative;overflow:hidden;page-break-after:always}
.hd{background:#15120e;color:#d9d4c7;padding:18px 36px 14px;display:flex;align-items:center;justify-content:space-between}.hd img{height:40px}.hd .t{text-align:right}.hd h1{margin:0;font-size:16px;font-weight:600;color:#ece7da}.hd p{margin:2px 0 0;font-size:9.5px;color:#a9a394}
.wrap{padding:16px 36px 0}.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.kpi div{background:#f4f2ec;border-radius:6px;padding:9px 11px}.kpi b{display:block;font-size:17px;font-weight:600;color:#15120e;margin:2px 0 1px}.kpi span{color:#6b685f;font-size:8.6px}
h2{font-size:10.5px;font-weight:600;margin:0 0 6px;color:#15120e;text-transform:uppercase;letter-spacing:.6px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th{text-align:right;font-weight:600;color:#6b685f;font-size:8.4px;border-bottom:1px solid #c3c2b7;padding:3px 4px}td{text-align:right;padding:3.5px 4px;border-bottom:1px solid #ebe9e2}
th:first-child,td:first-child{text-align:left}.l{text-align:left!important}.muted{color:#7a776f;text-align:left!important}
.cols{display:grid;grid-template-columns:1.35fr 1fr;gap:20px;margin-top:12px}ol{margin:0;padding-left:15px;font-size:10.2px;line-height:1.5}ol li{margin-bottom:8px}ol b{color:#15120e}
.leg{font-size:8.4px;color:#6b685f;margin-top:2px}.sw{display:inline-block;width:8px;height:8px;border-radius:2px;margin:0 3px -1px 8px}
.foot{position:absolute;bottom:14px;left:36px;right:36px;font-size:7.8px;color:#8a877e;border-top:1px solid #ebe9e2;padding-top:6px}
.t30 td{padding:3.2px 4px;font-size:8.6px;white-space:nowrap}.t30 th{font-size:8px}.al{font-size:7.2px;color:#8a877e;line-height:1.2}.n{color:#8a877e}.z{color:#c3c2b7}
.st{font-weight:600;font-size:8px}.ok{color:#2f7d32}.warn{color:#a26a00}.bad{color:#b23b3b}
.small td{font-size:8.6px;padding:3px 4px}'''
foot='* Junio inicia el 10 (apertura) y octubre corta el 17; se compara por día operado (corte 06:00). Recurrente = cliente con nombre que ha venido 2+ días distintos. Con nombre, 1 visita = vino un solo día (alguien de octubre todavía puede regresar). Genérico = "señor", "chavos", "pareja", etc. Nombres consolidados con Javi. Fuente: 938 comandas pagadas en el POS, sin propina.'
p1=f'''<div class=pg><div class="hd"><img src="data:image/png;base64,{logo}"><div class="t"><h1>Informe ejecutivo de clientes</h1><p>10 de junio – 17 de octubre de 2026 · cuentas cobradas, sin propina</p></div></div>
<div class="wrap"><div class="kpi">
<div><span>Venta del periodo</span><b>{f(k.venta.sum())}</b><span>{int(k.cuentas.sum())} cuentas · {int(k.dias.sum())} días operados</span></div>
<div><span>Venta de clientes recurrentes</span><b>{pct_rec.iloc[0]*100:.0f}% → {pct_rec.iloc[-1]*100:.0f}%</b><span>junio → octubre</span></div>
<div><span>Ticket promedio</span><b>$545 → $626</b><span>+15% junio → octubre</span></div>
<div><span>Clientes recurrentes</span><b>{len(recset)}</b><span>de 197 con nombre · {int((d==1).sum())} vinieron 1 vez</span></div></div>
<h2>Mes a mes</h2><table><tr><th>Mes</th><th>Días</th><th>Cuentas</th><th>Cuentas/día</th><th>Venta/día</th><th>Ticket</th><th>% venta recurrentes</th><th>Con nombre activos</th><th>Nuevos con nombre</th><th>Regresan</th></tr>{rows}</table>
<div class="cols"><div><h2>Conclusiones</h2><ol>
<li><b>La venta diaria tocó piso en agosto y se recupera.</b> De $6,197/día en la apertura a $3,526 en agosto; septiembre $3,847 y octubre $4,084. Menos cuentas por día (11.4 → 6.5), pero cada cuenta deja más.</li>
<li><b>Cada vez dependemos más de los que regresan.</b> Los recurrentes pasaron de {pct_rec.iloc[0]*100:.0f}% a {pct_rec.iloc[-1]*100:.0f}% de la venta. La gente sin nombre cayó de $1,625/día a $478/día (−71%).</li>
<li><b>Pocos clientes cargan el negocio.</b> El top 10 es el 41% de la venta; Ricardo Rojas solo, el 12%. Socios y familia (Eduardo, Javier, Marco Ibarra) suman otro 16%.</li>
<li><b>Llegan menos nuevos y regresan menos.</b> De quienes vinieron por primera vez con nombre, volvió otro día el 47% de junio, 36% de julio, 19% de agosto y 18% de septiembre. Desde agosto, 63 personas vinieron una sola vez ($43.7k).</li>
<li><b>Para vigilar:</b> Montserrat Díaz ($9.8k) no ha venido en octubre; Javier Vaquera y Álvaro vienen menos. Llegando fuerte: Arturo ($12k desde sep) y Toño Kenworth ($8.7k desde ago). Detalle en la hoja 2.</li></ol></div>
<div><h2>Venta por día operado</h2>{svg}
<div class="leg"><span class="sw" style="background:#2a78d6;margin-left:0"></span>Recurrentes<span class="sw" style="background:#85b7eb"></span>Con nombre, 1 visita<span class="sw" style="background:#b4b2a9"></span>Genéricos</div>
<h2 style="margin-top:14px">Quién trae más gente</h2><table><tr><th>Red ("amigos / familia de…")</th><th>Cuentas</th><th>Venta</th></tr>
{''.join(f"<tr><td>{n}{' (empleado)' if n=='Gus' else ''}</td><td>{int(r.loc[n].cuentas)}</td><td>{f(r.loc[n].venta)}</td></tr>" for n in r.index[:5])}</table>
</div></div></div><div class="foot">{foot}</div></div>'''
p2=f'''<div class=pg><div class="hd" style="padding:12px 36px 10px"><img src="data:image/png;base64,{logo}" style="height:30px"><div class="t"><h1 style="font-size:14px">Top 30 clientes y clientes que están llegando</h1><p>10 jun – 17 oct 2026 · venta sin propina</p></div></div>
<div class="wrap" style="padding-top:12px"><h2>Top 30 por consumo <span style="text-transform:none;font-weight:400;color:#6b685f;letter-spacing:0">— {share30*100:.0f}% de toda la venta</span></h2>
<table class=t30><tr><th class=l>#</th><th class=l>Cliente · nombres consolidados</th><th>Jun*</th><th>Jul</th><th>Ago</th><th>Sep</th><th>Oct*</th><th>Total</th><th>Cuentas</th><th>Días</th><th>Última</th><th class=l>Estado</th></tr>{t30}</table>
<h2 style="margin-top:12px">Clientes que están llegando <span style="text-transform:none;font-weight:400;color:#6b685f;letter-spacing:0">— primera visita desde agosto, 3+ días</span></h2>
<table class=small><tr><th class=l>Cliente</th><th>Desde</th><th>Días ago / sep / oct</th><th>Venta</th><th>Ticket</th><th>Última</th><th class=l>Estado</th></tr>{te}</table>
</div><div class="foot">Estado según la última visita al 17-oct: Activo = 14 días o menos · Enfriándose = 15 a 30 días · Perdido = más de 30 días. Días = días distintos que vino; Cuentas = comandas pagadas (puede abrir más de una por día). Juan Carlos (desde 30-jul, 4 días, $4,285, ticket $857) también vale la pena ubicarlo.</div></div>'''
open('informe2.html','w').write(f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{p1}{p2}</body></html>')
from playwright.sync_api import sync_playwright; import os
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); pg.goto('file://'+os.path.abspath('informe2.html')); pg.wait_for_timeout(300)
    pg.pdf(path='informe_clientes_jun_oct_2026.pdf',format='Letter',print_background=True,margin={'top':'0','bottom':'0','left':'0','right':'0'}); b.close()
print(len(em),"emergentes; top30 share",share30)
