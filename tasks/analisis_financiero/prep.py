# Informe financiero Continental — preparación de datos.
# Uso: python3 prep.py cobros.csv movimientos.csv FIN_YYYY-MM-DD
#   cobros.csv      = consulta 1 (payments)        · movimientos.csv = consulta 2 (cash_movements)
#   FIN             = último día operativo a incluir (ej. 2026-10-17)
# Genera pickles que lee build_pdf.py. Reglas confirmadas por Javi 2026-10-18 (ver tasks/reporte_mensual.md).
import sys, re, unicodedata, calendar, pandas as pd
cobros, movs, FIN = sys.argv[1], sys.argv[2], pd.Timestamp(sys.argv[3])
CORTE = FIN + pd.Timedelta(days=1)
RATE = {'mp': 0.035*1.16, 'getnet': 0.0187*1.16}          # comisión + IVA por terminal
RENTA, CONTADOR = 18000, 1500                              # fijos mensuales
LUZ = {'2026-06':2450,'2026-07':2450,'2026-08':3150,'2026-09':3150}  # bimestres CFE repartidos; meses sin recibo usan el último valor
NOMINA_A_GUS = [('2026-09-26 16:27', 2450)]                # pagos capturados con el empleado equivocado (ya corregido en BD)
NOMINA_DUP = [('2026-07-24 23:57', 538)]                   # duplicado regresado a caja con ajuste_ingreso

def load(f):
    d = pd.read_csv(f, na_values=['null']); d['ts'] = pd.to_datetime(d.fecha_mx)
    d['op'] = d.ts - pd.Timedelta(hours=6); d['mes'] = d.op.dt.strftime('%Y-%m'); d['dia'] = d.op.dt.date
    return d[d.op < CORTE].copy()
p, m = load(cobros), load(movs)
def norm(s):
    s = unicodedata.normalize('NFD', str(s)).encode('ascii','ignore').decode().lower()
    return re.sub(r'\s+',' ', re.sub(r'[^a-z0-9 ]',' ', s)).strip()
m['n'] = m.note.map(norm)
RULES = [
 ('EXCL_permiso', r'permiso'),
 ('EXCL_ajuste', r'error de carga|ingreso caja javier|cambio caja negro'),
 ('Renta', r'renta'), ('Luz', r'\bluz\b|cfe'), ('Contador', r'contador'), ('Seguro', r'seguro'),
 ('Cerveza', r'heineken|cerveza|tecate|cartones|cartab|indio|ultra|bohemia|modelo|corona'),
 ('Botellas y licores', r'oviedo|botella|centenario|cent plata|bacardi|buchanan|ginebra|vino|alameda|torres v|pomos|huitzila|bacacha|controy'),
 ('Hielo', r'yukon|hielo'),
 ('Refrescos, aguas y jugos', r'penafiel|coca|topo chico|squirt|fanta|volt|red bull|mineral|jugo|zumo|zummo|concentrado|jamaica|ginger|refresco|aguas?\b(?! continental| junio| julio)|r ?mar|r ar|\baldo\b|\bald\b|ald0|retiro vaquera|oxxo'),
 ('Comida (cocina)', r'liz|carnitas|comida|menudo|guisado|boneless|pizza|lalo'),
 ('Botanas', r'chicharr|botana|palomita|palomas|cacahuate|papas|frituras|cueritos|chetos'),
 ('Frutas y abarrotes', r'sal de gusano|limon|naranja|fruta|fruteria|jitomate|cilantro|cebolla|tortilla|salsa|crema|queso|aceite|chamoy|cardamomo|jicama|tostada|insumos|tajin|verdura'),
 ('Desechables y limpieza', r'pulcro|vaso|servilleta|desechable|copas|maxiplas|cubeta|trapeador|bolsa|agitador|rollo papel|limpieza|liner|popote|pala hielo|envases|chompi'),
 ('Servicios (basura, internet, agua, Getnet)', r'pago (de )?agua|basura|total ?play|youtube|getnet|agua continental|garrafon'),
 ('Mantenimiento', r'electrico|arreglo'), ('Publicidad y fotos', r'publicidad|foto'),
]
def cat(r):
    if r.category == 'pago_prestamo_banco': return 'EXCL_prestamo'
    if r.category.startswith('nomina'): return 'Nómina'
    if re.search(r'permiso', r.n): return 'EXCL_permiso'
    # chicharrón de lonja / estilo Ramos = comida; si viene con otras botanas o dice "duro" = botana
    if 'chicharr' in r.n and not re.search(r'palomit|palomas|cueritos|papas|cacahuate|duro|botana', r.n): return 'Comida (cocina)'
    for c, rx in RULES:
        if re.search(rx, r.n): return c
    return 'Otros'
e = m[m.movement_nature.isin(['expense','debt_payment']) & (m.category != 'propinas_entregadas')].copy()
e['cat'] = e.apply(cat, axis=1)
for f_, a in NOMINA_DUP: e = e[~((e.fecha_mx == f_) & (e.amount == a) & (e['cat'] == 'Nómina'))]
MS = sorted(p.mes.unique())
dias_mes = {mm: calendar.monthrange(int(mm[:4]), int(mm[5:]))[1] for mm in MS}
frac = {mm: (FIN.day / dias_mes[mm] if mm == FIN.strftime('%Y-%m') and FIN.day < dias_mes[mm] else 1) for mm in MS}
# ingresos y comisiones
p['venta'] = p.total_paid - p.tip_amount.fillna(0)
p['com'] = p.tarjeta * p.card_terminal.map(RATE).fillna(RATE['mp']); p['com_mp'] = p.tarjeta * RATE['mp']
ing = p.groupby('mes').agg(venta=('venta','sum'), propina=('tip_amount','sum'), tarjeta=('tarjeta','sum'), efectivo=('efectivo','sum'), transf=('transferencia','sum'), com=('com','sum'), com_mp=('com_all_mp' if False else 'com_mp','sum'))
# gastos por categoría
op = e[~e['cat'].str.startswith('EXCL') & ~e['cat'].isin(['Renta','Luz','Contador'])]
cat_ = op.pivot_table(index='cat', columns='mes', values='amount', aggfunc='sum', fill_value=0).reindex(columns=MS, fill_value=0)
ult = None
for mm in MS:
    ult = LUZ.get(mm, ult)
    cat_.loc['Renta', mm] = RENTA*frac[mm]; cat_.loc['Contador', mm] = CONTADOR*frac[mm]; cat_.loc['Luz', mm] = ult*frac[mm]
cat_.loc['Comisiones de tarjeta'] = ing.com.reindex(MS)
cat_ = cat_.loc[cat_.sum(axis=1).sort_values(ascending=False).index]
ex = e[e['cat'].str.startswith('EXCL')].pivot_table(index='cat', columns='mes', values='amount', aggfunc='sum', fill_value=0).reindex(columns=MS, fill_value=0)
V = ing.venta.reindex(MS)
r = pd.DataFrame({'dias': p.groupby('mes').dia.nunique(), 'venta': V, 'gasto_op': cat_.sum()})
r['resultado'] = r.venta - r.gasto_op
r['permiso'] = ex.loc['EXCL_permiso'] if 'EXCL_permiso' in ex.index else 0
r['prestamo'] = ex.loc['EXCL_prestamo'] if 'EXCL_prestamo' in ex.index else 0
r['resultado_total'] = r.resultado - r.permiso - r.prestamo; r['res_dia'] = r.resultado / r.dias
G = {'Costo de producto': ['Botellas y licores','Cerveza','Refrescos, aguas y jugos','Hielo','Comida (cocina)','Botanas','Frutas y abarrotes'],
     'Desechables y comisiones': ['Desechables y limpieza','Comisiones de tarjeta'], 'Nómina': ['Nómina'],
     'Renta, luz, contador y servicios': ['Renta','Luz','Servicios (basura, internet, agua, Getnet)','Contador'],
     'Otros fijos (seguro, fotos, mantenimiento)': ['Seguro','Publicidad y fotos','Mantenimiento','Otros']}
casc = pd.DataFrame({g: cat_.loc[[c for c in l if c in cat_.index]].sum() for g, l in G.items()}).T
# nómina semanal: pagos de domingo o lunes = semana anterior (la nómina se paga el sábado)
n = e[e['cat'] == 'Nómina'].copy()
def emp(s):
    for k, v in [('memo','Memo'),('gus','Gus'),('javier','Javier'),('alexis','Alexis'),('negro','Negro')]:
        if k in s: return v
    return 'Otro'
n['emp'] = n.n.map(emp)
for f_, a in NOMINA_A_GUS: n.loc[(n.fecha_mx == f_) & (n.amount == a), 'emp'] = 'Gus'
d = n.op.dt.dayofweek; st = n.op.dt.normalize() - pd.to_timedelta((d+1) % 7, unit='D')
n['sem'] = st - pd.to_timedelta(d.isin([6,0]).astype(int)*7, unit='D')
p['sem'] = p.op.dt.normalize() - pd.to_timedelta((p.op.dt.dayofweek+1) % 7, unit='D')
W = n.pivot_table(index='sem', columns='emp', values='amount', aggfunc='sum', fill_value=0)
W = p.groupby('sem').agg(venta=('venta','sum'), dias=('dia','nunique')).join(W).fillna(0)
emps = [c for c in ['Memo','Gus','Javier','Alexis','Negro','Otro'] if c in W.columns]
W['total'] = W[emps].sum(axis=1); W['pct'] = W.total / W.venta * 100
for k, v in dict(cat=cat_, r=r, casc=casc, W=W, e=e, ing=ing).items(): v.to_pickle(k + '.pkl')
print('venta', round(V.sum(),2), '| gasto_op', round(cat_.values.sum(),2), '| resultado', round(r.resultado.sum(),2), '| permiso', r.permiso.sum(), '| prestamo', r.prestamo.sum())
print('Otros (revisar si aparece algo nuevo):'); print(e[e['cat']=='Otros'][['fecha_mx','amount','note']].to_string())
