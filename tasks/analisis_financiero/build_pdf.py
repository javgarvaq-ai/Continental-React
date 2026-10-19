# Informe financiero Continental — genera el PDF de 3 hojas a partir de los pickles de prep.py.
# Uso: python3 build_pdf.py   (en la carpeta donde corriste prep.py; necesita logo.png y playwright)
# ⚠️ Los textos de conclusiones, KPIs de equilibrio, nombres de meses (MS/ML) y fechas del periodo están
#    escritos para jun–oct 2026: REESCRIBIRLOS con los números nuevos en cada informe. Las tablas sí se calculan solas.
import pandas as pd, base64, os
cat=pd.read_pickle('cat.pkl'); res=pd.read_pickle('r.pkl'); ing=pd.read_pickle('ing.pkl'); W=pd.read_pickle('W.pkl'); e=pd.read_pickle('e.pkl'); casc=pd.read_pickle('casc.pkl')
MS=['2026-06','2026-07','2026-08','2026-09','2026-10']; ML={'2026-06':'Jun','2026-07':'Jul','2026-08':'Ago','2026-09':'Sep','2026-10':'Oct*'}
f=lambda v:('-' if v<0 else '')+'$'+format(abs(round(v)),',')
cls=lambda v:'neg' if v<0 else 'pos'
logo=base64.b64encode(open('logo.png','rb').read()).decode()
# ---------- page 1
rows=''
for m in MS:
    r=res.loc[m]
    rows+=f"<tr><td>{ML[m]}</td><td>{int(r.dias)}</td><td>{f(r.venta)}</td><td>{f(r.gasto_op)}</td><td class={cls(r.resultado)}><b>{f(r.resultado)}</b></td><td class={cls(r.res_dia)}>{f(r.res_dia)}</td><td>{f(r.permiso)}</td><td>{f(r.prestamo)}</td><td class={cls(r.resultado_total)}>{f(r.resultado_total)}</td></tr>"
T=res.sum(numeric_only=True)
rows+=f"<tr class=tot><td>Total</td><td>{int(T.dias)}</td><td>{f(T.venta)}</td><td>{f(T.gasto_op)}</td><td class={cls(T.resultado)}><b>{f(T.resultado)}</b></td><td>{f(T.resultado/T.dias)}</td><td>{f(T.permiso)}</td><td>{f(T.prestamo)}</td><td class={cls(T.resultado_total)}>{f(T.resultado_total)}</td></tr>"
# svg grouped bars + result markers
Wd,H=330,190; top=10; base=H-40; vmax=140000; bw=20; gx=(Wd-40)/5
svg=''
for i,m in enumerate(MS):
    x0=36+i*gx+gx/2-bw-1
    for j,(v,c) in enumerate([(res.loc[m,'venta'],'#2a78d6'),(res.loc[m,'gasto_op'],'#eb6834')]):
        h=v/vmax*(base-top); svg+=f'<rect x="{x0+j*(bw+2):.1f}" y="{base-h:.1f}" width="{bw}" height="{h:.1f}" rx="2.5" fill="{c}"/>'
    r=res.loc[m,'resultado']
    svg+=f'<text x="{36+i*gx+gx/2:.1f}" y="{H-24}" text-anchor="middle" font-size="8.5" fill="#7a776f">{ML[m]}</text>'
    svg+=f'<text x="{36+i*gx+gx/2:.1f}" y="{H-11}" text-anchor="middle" font-size="8.6" font-weight="600" fill="{"#2f7d32" if r>=0 else "#b23b3b"}">{f(r)}</text>'
for t in [0,50000,100000]:
    y=base-t/vmax*(base-top); svg+=f'<line x1="34" x2="{Wd}" y1="{y:.1f}" y2="{y:.1f}" stroke="{"#c3c2b7" if t==0 else "#ebe9e2"}"/><text x="30" y="{y+3:.1f}" text-anchor="end" font-size="7.5" fill="#8a877e">{t//1000}k</text>'
svg=f'<svg viewBox="0 0 {Wd} {H}" width="100%">{svg}<text x="0" y="{H-11}" font-size="7.5" fill="#8a877e">Resultado</text></svg>'
cr=''
MS5=MS
for g in casc.index:
    vals=''.join(f"<td>{casc.loc[g,m]/res.loc[m,'venta']*100:.1f}</td>" for m in MS5)
    cr+=f"<tr><td class=l>− {g}</td>{vals}<td><b>{casc.loc[g].sum()/T.venta*100:.1f}</b></td></tr>"
    if g=='Desechables y comisiones':
        q=lambda m:100-(casc.loc['Costo de producto',m]+casc.loc[g,m])/res.loc[m,'venta']*100
        cr+=f"<tr class=sub><td class=l>= Queda después del producto</td>{''.join(f'<td>{q(m):.1f}</td>' for m in MS5)}<td><b>{100-(casc.loc['Costo de producto'].sum()+casc.loc[g].sum())/T.venta*100:.1f}</b></td></tr>"
rp=lambda v,b:f"{v/b*100:.1f}"
cr+=f"<tr class=tot><td class=l>= Resultado operativo</td>{''.join(f'<td class={cls(res.loc[m,chr(114)+'esultado'])}>{rp(res.loc[m,'resultado'],res.loc[m,'venta'])}</td>' for m in MS5)}<td class=pos><b>{rp(T.resultado,T.venta)}</b></td></tr>"
cr+=f"<tr><td class=l>− Permiso + préstamo</td>{''.join(f'<td>{rp(res.loc[m,chr(112)+'ermiso']+res.loc[m,'prestamo'],res.loc[m,'venta'])}</td>' for m in MS5)}<td><b>{rp(T.permiso+T.prestamo,T.venta)}</b></td></tr>"
cr+=f"<tr class=tot><td class=l>= Después de temporales</td>{''.join(f'<td class={cls(res.loc[m,chr(114)+'esultado_total'])}>{rp(res.loc[m,'resultado_total'],res.loc[m,'venta'])}</td>' for m in MS5)}<td class=neg><b>{rp(T.resultado_total,T.venta)}</b></td></tr>"
p1=f'''<div class=pg><div class=hd><img src="data:image/png;base64,{logo}"><div class=t><h1>Informe financiero</h1><p>10 de junio – 17 de octubre de 2026 · ingresos vs gastos, mes a mes</p></div></div><div class=wrap>
<div class=kpi>
<div><span>Resultado sin permiso ni préstamo</span><b class=pos>+{f(T.resultado)}</b><span>{T.dias:.0f} días · ~{f(T.resultado/T.dias)} por día · {T.resultado/T.venta*100:.0f}% de la venta</span></div>
<div><span>Permiso + préstamo pagados</span><b>{f(T.permiso+T.prestamo)}</b><span>~$26,000 al mes desde julio</span></div>
<div><span>Venta diaria de equilibrio</span><b>$3,527</b><span>con permiso y préstamo: $5,197</span></div>
<div><span>Venta diaria real (ago–oct)</span><b>$3,819</b><span>junio $6,197 · octubre $4,262</span></div></div>
<h2>Mes a mes</h2>
<table><tr><th>Mes</th><th>Días</th><th>Ingreso</th><th>Gasto operativo</th><th>Resultado</th><th>Por día</th><th>Permiso</th><th>Préstamo</th><th>Después de ambos</th></tr>{rows}</table>
<div class=cols><div><h2>De cada $100 que vendemos</h2>
<table class=t2><tr><th class=l></th>{''.join(f'<th>{ML[m]}</th>' for m in MS5)}<th>Periodo</th></tr>{cr}</table>
<p class=note style="margin-top:6px">Costo de producto = compras de botellas, cerveza, refrescos, hielo, comida, botanas y abarrotes en el mes (aproximación al costo: depende de cuánto se surtió cada mes).</p></div>
<div><h2>Ingreso vs gasto operativo</h2>{svg}
<div class=leg><span class=sw style="background:#2a78d6;margin-left:0"></span>Ingreso<span class=sw style="background:#eb6834"></span>Gasto operativo · abajo: resultado del mes</div></div></div>
<h2 style="margin-top:12px">Conclusiones</h2><ol class=two>
<li><b>De cada $100 vendidos quedan ~$9 de resultado operativo:</b> $40 se van en producto, $4 en desechables y comisiones, $23 en nómina y $24 en renta, servicios y otros fijos.</li>
<li><b>Con permiso y préstamo (~$26k al mes, $18 de cada $100) estamos en rojo desde julio:</b> −$14k, −$31k y −$23k. Cubrirlos pide $5,197 de venta diaria contra $3,819 en ago–oct (+$1,378 por día).</li>
<li><b>Sin esos temporales el bar se sostiene:</b> +$48.7k en el periodo. Agosto fue el único mes en rojo (−$5.3k), con $5.4k de gastos de una sola vez (eléctrico y fotos).</li>
<li><b>Octubre va mejor:</b> $4,262 de venta y $3,490 de gasto por día al 17 de octubre (+$773 por día).</li>
<li><b>La nómina pesa cada vez más:</b> de 19% a 26% de la venta. Por semana bajó 11% desde agosto, pero la venta semanal bajó 26%.</li></ol></div>
<div class=foot>Ingreso = venta sin propina (la propina cobrada, $54.3k, se entrega completa al personal). Gasto operativo = lo que salió de caja, caja fuerte o banco, clasificado por la nota, + comisiones de tarjeta (MP 4.06%, Getnet 2.17%). Fijos al mes: renta $18,000, contador $1,500, luz repartida por bimestre; octubre prorrateado a 17 días. Incluye pagos directos de socios. Fuera: permiso provisional, préstamo, traspasos entre cuentas, aportaciones y ajustes. Equilibrio: fijos ago–oct $1,966/día ÷ (1 − 44% variable). *Octubre al 17.</div></div>'''

# ---------- page 2
crow=''
tv=res.venta.sum()
for c in cat.index:
    vals=''.join(f"<td>{f(cat.loc[c,m]) if round(cat.loc[c,m]) else '<span class=z>–</span>'}</td>" for m in MS)
    tot=cat.loc[c].sum()
    crow+=f"<tr><td class=l>{c.replace(' (basura, internet, agua, Getnet)','')}</td>{vals}<td><b>{f(tot)}</b></td><td>{tot/tv*100:.1f}%</td></tr>"
crow+=f"<tr class=tot><td class=l>Total gasto operativo</td>{''.join(f'<td>{f(cat[m].sum())}</td>' for m in MS)}<td><b>{f(cat.values.sum())}</b></td><td>{cat.values.sum()/tv*100:.1f}%</td></tr>"
crow+=f"<tr class=tot><td class=l>Ingreso</td>{''.join(f'<td>{f(res.loc[m,"venta"])}</td>' for m in MS)}<td><b>{f(tv)}</b></td><td>100%</td></tr>"
beb=['Botellas y licores','Cerveza','Refrescos, aguas y jugos','Hielo']
pr=lambda rowname,s: f"<tr><td class=l>{rowname}</td>{''.join(f'<td>{v:.1f}%</td>' for v in s)}</tr>"
ratios=pr('Nómina',cat.loc['Nómina',MS]/res.venta[MS]*100)+pr('Compras de bebida',cat.loc[beb,MS].sum()/res.venta[MS]*100)+pr('Comida + botanas',cat.loc[['Comida (cocina)','Botanas'],MS].sum()/res.venta[MS]*100)+pr('Renta, luz, contador, servicios',cat.loc[['Renta','Luz','Contador','Servicios (basura, internet, agua, Getnet)'],MS].sum()/res.venta[MS]*100)
com=''.join(f"<tr><td class=l>{ML[m]}</td><td>{f(ing.loc[m,'tarjeta'])}</td><td>{f(ing.loc[m,'com'])}</td><td>{f(ing.loc[m,'com_mp']-ing.loc[m,'com'])}</td></tr>" for m in MS)
ex=e[e.cat.isin(['EXCL_permiso','EXCL_prestamo'])].sort_values('ts')
exr=''.join(f"<tr><td class=l>{r.ts.day}-{['jun','jul','ago','sep','oct'][r.ts.month-6]}</td><td class=l>{'Permiso' if r['cat']=='EXCL_permiso' else 'Préstamo Juan'}</td><td>{f(r.amount)}</td></tr>" for _,r in ex.iterrows())
p2=f'''<div class=pg><div class="hd sm"><img src="data:image/png;base64,{logo}"><div class=t><h1>Gastos por categoría</h1><p>clasificados por lo que dice la nota · 10 jun – 17 oct 2026</p></div></div><div class=wrap>
<table class=t2><tr><th class=l>Categoría</th>{''.join(f'<th>{ML[m]}</th>' for m in MS)}<th>Total</th><th>% venta</th></tr>{crow}</table>
<div class=cols3>
<div><h2>Peso sobre la venta</h2><table class=t2><tr><th class=l></th>{''.join(f'<th>{ML[m]}</th>' for m in MS)}</tr>{ratios}</table>
<h2 style="margin-top:12px">Comisiones de tarjeta</h2><table class=t2><tr><th class=l>Mes</th><th>Cobrado con tarjeta</th><th>Comisión</th><th>Ahorro por Getnet</th></tr>{com}</table>
<p class=note>Getnet (2.17%) procesa ~95% de la tarjeta y ahorra ~$1,100 al mes contra Mercado Pago (4.06%). MP queda como respaldo cuando falla la terminal de Getnet.</p></div>
<div><h2>Conclusiones de gastos</h2><ul>
<li><b>Nómina</b> es el gasto más grande: {cat.loc['Nómina'].sum()/cat.values.sum()*100:.0f}% del gasto y 23% de la venta.</li>
<li><b>Compras de bebida</b> (botellas, cerveza, refrescos, hielo): 30% de la venta en junio, entre 34% y 37% en jul–sep y 25% en lo que va de octubre.</li>
<li><b>Comida de cocina</b> bajó de $6.4k (jun) a $3.9k (sep): el chicharrón de lonja reemplazó parte de la comida que se pedía antes.</li>
<li><b>Gastos de una sola vez:</b> agosto, arreglo eléctrico $2,800 y fotos $2,600; desechables de agosto ($3,750) incluye compra de copas. Seguro anual $4,000 cada junio.</li>
<li><b>Fijos al mes:</b> renta $18,000 · contador $1,500 · luz ~$2,450–3,150 (bimestral) · basura ~$2,900–3,200 · Total Play ~$700–840 · YouTube $159.</li>
<li><b>Pendientes de pago:</b> renta septiembre $3,000 y contador septiembre $1,500.</li></ul>
<h2 style="margin-top:10px">Permiso y préstamo (fuera de la operación)</h2>
<table class='t2 t2c'><tr><th class=l>Fecha</th><th class=l>Concepto</th><th>Monto</th></tr>{exr}
<tr class=tot><td class=l colspan=2>Permiso (jul–ago por mes; desde sep por días, ~$330/día)</td><td>{f(res.permiso.sum())}</td></tr>
<tr class=tot><td class=l colspan=2>Préstamo Juan: 4 × $15,500 (jun–sep) ✓</td><td>{f(res.prestamo.sum())}</td></tr></table></div></div></div>
<div class=foot>Categorías por la nota: "heineken", "cartones" → Cerveza; "oviedo", "bacacha", "controy" → Botellas; "aldo", "r mar" → Refrescos; chicharrón de lonja / estilo Ramos → Comida; chicharrón duro → Botanas; Yukon → Hielo. Servicios = basura, Total Play, YouTube, agua, Getnet. % venta = total del periodo ÷ ingreso del periodo. Préstamo de septiembre incluye $5,600 pagados por Eduardo para completar.</div></div>'''
# ---------- page 3
wr=''
best=set(W[W.dias>=5].iloc[:-1].total.nlargest(5).index)
for s,r in W.iterrows():
    hl=' class=hl' if s in best else ''
    wr+=f"<tr{hl}><td class=l>{s.day} {['jun','jul','ago','sep','oct'][s.month-6]}</td><td>{int(r.dias)}</td><td>{f(r.venta)}</td>"+''.join(f"<td>{f(r[c]) if r[c] else '<span class=z>–</span>'}</td>" for c in ['Memo','Gus','Javier','Alexis','Negro'])+f"<td><b>{f(r.total)}</b></td><td>{r.pct:.0f}%</td></tr>"
full=W[W.dias>=5].iloc[:-1]; ant=full[full.index<'2026-08-02']; ago=full[full.index>='2026-08-02']
# svg pct line
Wd,H=330,120; xs=[30+i*(Wd-40)/(len(W)-1) for i in range(len(W))]; ymin,ymax=15,40
y=lambda v: H-18-(v-ymin)/(ymax-ymin)*(H-30)
pts=' '.join(f"{x:.1f},{y(v):.1f}" for x,v in zip(xs,W.pct))
sv=''.join(f'<line x1="28" x2="{Wd}" y1="{y(t):.1f}" y2="{y(t):.1f}" stroke="#ebe9e2"/><text x="24" y="{y(t)+3:.1f}" text-anchor="end" font-size="7.5" fill="#8a877e">{t}%</text>' for t in [15,20,25,30,35,40])
sv+=f'<line x1="{xs[8]-4:.1f}" x2="{xs[8]-4:.1f}" y1="8" y2="{H-18}" stroke="#c3c2b7" stroke-dasharray="3 3"/><text x="{xs[8]:.1f}" y="14" font-size="7.5" fill="#8a877e">agosto →</text>'
sv+=f'<polyline points="{pts}" fill="none" stroke="#eb6834" stroke-width="2" stroke-linejoin="round"/>'+''.join(f'<circle cx="{x:.1f}" cy="{y(v):.1f}" r="2.6" fill="#eb6834"/>' for x,v in zip(xs,W.pct))
sv+=''.join(f'<text x="{xs[i]:.1f}" y="{H-5}" text-anchor="middle" font-size="7" fill="#8a877e">{s.day}/{s.month}</text>' for i,s in enumerate(W.index) if i%3==0)
svg3=f'<svg viewBox="0 0 {Wd} {H}" width="100%">{sv}</svg>'
emp=e[e.cat=='Nómina']
p3=f'''<div class=pg><div class="hd sm"><img src="data:image/png;base64,{logo}"><div class=t><h1>Nómina semanal vs venta</h1><p>semanas domingo–sábado · 10 jun – 17 oct 2026</p></div></div><div class=wrap>
<div class=kpi>
<div><span>Nómina promedio por semana</span><b>{f(full.total.mean())}</b><span>{len(full)} semanas completas</span></div>
<div><span>Jun–jul → desde agosto</span><b>{f(ant.total.mean())} → {f(ago.total.mean())}</b><span>−{(1-ago.total.mean()/ant.total.mean())*100:.0f}% por semana</span></div>
<div><span>Venta semanal en el mismo lapso</span><b>{f(ant.venta.mean())} → {f(ago.venta.mean())}</b><span>−{(1-ago.venta.mean()/ant.venta.mean())*100:.0f}% por semana</span></div>
<div><span>Nómina / venta</span><b>{ant.total.sum()/ant.venta.sum()*100:.1f}% → {ago.total.sum()/ago.venta.sum()*100:.1f}%</b><span>sube porque la venta cayó más</span></div></div>
<table class=t3><tr><th class=l>Semana</th><th>Días</th><th>Venta</th><th>Memo</th><th>Gus</th><th>Javier</th><th>Alexis</th><th>Negro</th><th>Nómina</th><th>% venta</th></tr>{wr}</table>
<div class=cols><div><h2>Conclusiones de nómina</h2><ul>
<li><b>La nómina sí sigue a la venta:</b> las 5 semanas de nómina más cara (sombreadas) son exactamente las 5 semanas de más venta: 14, 21 y 28 de junio, 5 de julio y 13 de septiembre. Correlación 0.82.</li>
<li><b>Desde agosto la nómina bajó 11% por semana ($6,869 → $6,116), pero la venta bajó 26%</b> ($33,623 → $24,973). Por eso pasó de 20.4% a 24.5% de la venta.</li>
<li><b>Semanas bajas con nómina normal:</b> 6-sep (39%), 20-sep (33%) y 23 y 30 de ago (27%). La nómina casi no se ajusta cuando la venta cae.</li>
<li><b>Por persona en el periodo:</b> Memo {f(W.Memo.sum())} · Gus {f(W.Gus.sum())} · Javier {f(W.Javier.sum())} · Alexis {f(W.Alexis.sum())} (jun–jul) · Negro {f(W.Negro.sum())}.</li></ul></div>
<div><h2>Nómina como % de la venta, por semana</h2>{svg3}</div></div></div>
<div class=foot>Nómina asignada a la semana trabajada: la nómina se paga el sábado; los pagos de domingo o lunes cuentan para la semana anterior. Semanas sin pago de Javier = sin pago registrado. La semana del 11-oct todavía no incluye la nómina de Javier y no entra en los promedios; la del 7-jun arranca el 10 (apertura) y tampoco entra. Incluye la corrección del pago de $2,450 del 26-sep (era de Gus) y quita una captura duplicada de $538 del 24-jul que ya se había regresado a caja.</div></div>'''
CSS='@page{size:letter;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Inter,sans-serif;color:#2b2925;font-size:9.6px;line-height:1.42}\n.pg{width:8.5in;height:11in;position:relative;overflow:hidden;page-break-after:always}\n.hd{background:#15120e;color:#d9d4c7;padding:18px 36px 14px;display:flex;align-items:center;justify-content:space-between}.hd img{height:40px}.hd .t{text-align:right}.hd h1{margin:0;font-size:16px;font-weight:600;color:#ece7da}.hd p{margin:2px 0 0;font-size:9.5px;color:#a9a394}\n.wrap{padding:16px 36px 0}.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.kpi div{background:#f4f2ec;border-radius:6px;padding:9px 11px}.kpi b{display:block;font-size:17px;font-weight:600;color:#15120e;margin:2px 0 1px}.kpi span{color:#6b685f;font-size:8.6px}\nh2{font-size:10.5px;font-weight:600;margin:0 0 6px;color:#15120e;text-transform:uppercase;letter-spacing:.6px}\ntable{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th{text-align:right;font-weight:600;color:#6b685f;font-size:8.4px;border-bottom:1px solid #c3c2b7;padding:3px 4px}td{text-align:right;padding:3.5px 4px;border-bottom:1px solid #ebe9e2}\nth:first-child,td:first-child{text-align:left}.l{text-align:left!important}.muted{color:#7a776f;text-align:left!important}\n.cols{display:grid;grid-template-columns:1.35fr 1fr;gap:20px;margin-top:12px}ol{margin:0;padding-left:15px;font-size:10.2px;line-height:1.5}ol li{margin-bottom:8px}ol b{color:#15120e}\n.leg{font-size:8.4px;color:#6b685f;margin-top:2px}.sw{display:inline-block;width:8px;height:8px;border-radius:2px;margin:0 3px -1px 8px}\n.foot{position:absolute;bottom:14px;left:36px;right:36px;font-size:7.8px;color:#8a877e;border-top:1px solid #ebe9e2;padding-top:6px}\n.t30 td{padding:3.2px 4px;font-size:8.6px;white-space:nowrap}.t30 th{font-size:8px}.al{font-size:7.2px;color:#8a877e;line-height:1.2}.n{color:#8a877e}.z{color:#c3c2b7}\n.st{font-weight:600;font-size:8px}.ok{color:#2f7d32}.warn{color:#a26a00}.bad{color:#b23b3b}\n.small td{font-size:8.6px;padding:3px 4px}'
CSS+='''.hd.sm{padding:12px 36px 10px}.hd.sm img{height:30px}.hd.sm h1{font-size:14px}
.pos{color:#2f7d32}.neg{color:#b23b3b}.sub td{font-weight:600;color:#15120e;border-top:1px solid #c3c2b7}ol.two{columns:2;column-gap:22px;font-size:9.6px}ol.two li{break-inside:avoid}.tot td{border-top:1px solid #c3c2b7;font-weight:600;background:#f8f7f3}.note{font-size:8.6px;color:#5b5850;line-height:1.45}
.t2 td{padding:2.4px 4px;font-size:8.7px}.t2c td{padding:1.6px 4px!important;font-size:8.4px!important}.t3 td{padding:2.4px 4px;font-size:8.6px}.hl td{background:#fdf1e8}
.cols3{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:12px}ul{margin:0;padding-left:14px;font-size:9.4px;line-height:1.48}ul li{margin-bottom:5px}h2{margin-top:2px}'''
open('fin.html','w').write(f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{p1}{p2}{p3}</body></html>')
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); pg.goto('file://'+os.path.abspath('fin.html')); pg.wait_for_timeout(300)
    pg.pdf(path='informe_financiero_jun_oct_2026.pdf',format='Letter',print_background=True,margin={'top':'0','bottom':'0','left':'0','right':'0'}); b.close()
