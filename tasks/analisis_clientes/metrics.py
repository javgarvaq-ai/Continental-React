# Metricas mes a mes (lee df.pkl de classify.py)
import pandas as pd, json
df=pd.read_pickle('df.pkl'); pd.set_option('display.width',220)
M=sorted(df.mes.unique())
out={}
k=df.groupby('mes').agg(cuentas=('folio','count'),venta=('final_total','sum'),propina=('tip_total','sum'),dias=('dia','nunique'))
k['ticket']=k.venta/k.cuentas; k['cuentas_dia']=k.cuentas/k.dias; k['venta_dia']=k.venta/k.dias
kn=df[df.tipo=='Conocido'].groupby('mes').agg(c_con=('folio','count'),v_con=('final_total','sum'),clientes=('cliente','nunique'))
k=k.join(kn); k['pct_c_con']=k.c_con/k.cuentas; k['pct_v_con']=k.v_con/k.venta
g=df[df.tipo=='Genérico'].groupby('mes').agg(v_gen=('final_total','sum')); k=k.join(g)
k['ticket_con']=k.v_con/k.c_con; k['ticket_gen']=k.v_gen/(k.cuentas-k.c_con)
print(k.round(2))
# recurrencia
kc=df[df.tipo=='Conocido']; first=kc.groupby('cliente').mes.min()
seen={m:set(kc[kc.mes==m].cliente) for m in M}
rec=[]
for i,m in enumerate(M):
    s=seen[m]; prev=set().union(*[seen[x] for x in M[:i]]) if i else set(); last=seen[M[i-1]] if i else set()
    new=s-prev; ret=s&prev; lost=last-s
    rec.append(dict(mes=m,activos=len(s),nuevos=len(new),regresan=len(ret),del_mes_anterior=len(s&last),perdidos=len(lost),
      v_nuevos=kc[(kc.mes==m)&kc.cliente.isin(new)].final_total.sum(), v_regresan=kc[(kc.mes==m)&kc.cliente.isin(ret)].final_total.sum()))
rec=pd.DataFrame(rec); print(rec)
# frecuencia por mes
f=kc.groupby(['mes','cliente']).folio.count().reset_index()
f['seg']=pd.cut(f.folio,[0,1,3,999],labels=['1 visita','2–3','4+'])
print(f.groupby(['mes','seg'],observed=False).cliente.count().unstack())
# top overall
t=kc.groupby('cliente').agg(visitas=('folio','count'),venta=('final_total','sum'),meses=('mes','nunique'),primera=('mes','min'),ultima=('mes','max')).sort_values('venta',ascending=False)
t['ticket']=t.venta/t.visitas
print(t.head(20).round(0))
pv=kc.pivot_table(index='cliente',columns='mes',values='final_total',aggfunc='sum',fill_value=0)
print(pv.loc[t.head(15).index].round(0))
pc=kc.pivot_table(index='cliente',columns='mes',values='folio',aggfunc='count',fill_value=0)
print(pc.loc[t.head(15).index])
# top by visits
print(t.sort_values('visitas',ascending=False).head(12)[['visitas','venta','meses']])
# concentration
tot=kc.final_total.sum(); print("top10 share of known:",t.head(10).venta.sum()/tot, "of total:",t.head(10).venta.sum()/df.final_total.sum())
# redes
r=df[df.red.notna()].groupby('red').agg(cuentas=('folio','count'),venta=('final_total','sum')).sort_values('venta',ascending=False); print(r)
# lost top clients: last seen before Oct with >=4 visits
print(t[(t.visitas>=4)&(t.ultima<'2026-10')])
# weekday
print(df.groupby(df.op.dt.dayofweek).agg(c=('folio','count'),v=('final_total','sum')))
print("TOTAL",len(df),df.final_total.sum(),df.tip_total.sum())
k.to_pickle('k.pkl'); rec.to_pickle('rec.pkl'); t.to_pickle('t.pkl'); pv.to_pickle('pv.pkl'); pc.to_pickle('pc.pkl'); r.to_pickle('r.pkl')
f.groupby(['mes','seg'],observed=False).cliente.count().unstack().to_pickle('seg.pkl')
