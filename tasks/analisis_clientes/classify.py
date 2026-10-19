# Clasifica cuentas: uso -> python3 classify.py export.csv  (genera df.pkl)
# MERGE = alias -> persona; NETWORK = "amigos/familia de X" -> X; GEN_* = genericos.
# Actualizar MERGE/NETWORK con los nombres nuevos que confirme Javi cada mes.
import sys,pandas as pd,unicodedata,re,json
F=sys.argv[1] if len(sys.argv)>1 else "/root/.claude/uploads/6009304a-18e3-5cf1-be30-a3ab7d9836ab/c352518d-Supabase_Snippet_Untitled_query_22.csv"
df=pd.read_csv(F, na_values=['null'])
def norm(s):
    s=unicodedata.normalize('NFD',str(s)).encode('ascii','ignore').decode().lower()
    s=re.sub(r'[^a-z0-9 ]',' ',s); return re.sub(r'\s+',' ',s).strip()
df['n']=df.apply(lambda r: norm(r.cliente_registrado) if pd.notna(r.cliente_registrado) else norm(r.customer_name),axis=1)

MERGE={ # normalized -> display identity
 **{k:'Ricardo Rojas' for k in ['ricardo rojas','abogado','abogadoi','ricar','ricard','ricarr','ricvha','ricardo 10 10 26','ricardo rojas 08 10 26','ricardo','sr jaime ricardo rojas']},
 **{k:'Mauricio De La Vega' for k in ['mauricio de la vega','mau','mauricio','mau y juan']},
 **{k:'Montserrat Díaz' for k in ['montserrat','monsterrat diaz','montse','montze','monse','momnste']},
 **{k:'Izela' for k in ['isela','izela','vicky izela']},
 **{k:'Karla' for k in ['karla','karla t']},
 **{k:'Pantoja' for k in ['pantoja','pantoi','pamtoja']},
 **{k:'Randy Patrón' for k in ['randy','randy patron']},
 **{k:'China Sarai' for k in ['china','china sarai','china barra']},
 **{k:'Toño Kenworth' for k in ['tono kenworth','tono','antonio kenworth','tono y nayeli']},
 **{k:'Jigasoft' for k in ['jygasoft','jigasost']},
 **{k:'Peruzzi' for k in ['peruzzi','peruzi']},
 **{k:'Haydee' for k in ['haydee','hayde','haydew']},
 **{k:'Cecy' for k in ['ceci','cecy','cecilia']},
 **{k:'Zuli' for k in ['zuli','zully']},
 **{k:'Martín del Hoyo' for k in ['martin','martin del hoyo']},
 **{k:'Álvaro' for k in ['alvaro','alvaro express']},
 **{k:'Dulce' for k in ['dulce','dulc arcoiris']},
 **{k:'Barón' for k in ['baron','barron']},
 **{k:'Juan Calvillo' for k in ['juan calvillo','calvillo']},
 **{k:'Erick' for k in ['erick','erik','eric','erick calvillo','erick poke']},
 **{k:'Claudia Bernal' for k in ['claudia','claudia bernal']},
 **{k:'Liz' for k in ['liz','liz comida','loiz']},
 **{k:'Memo' for k in ['memo','memo q']},
 **{k:'Tachi' for k in ['tachi','tac']},
 **{k:'Hermana de Gus' for k in ['hermana gus','hermana de gus']},
 **{k:'Hermana de Izela' for k in ['hermana izela','hermana isela']},
 **{k:'Papá de Javier' for k in ['papa javier','papas javi']},
 **{k:'Amigas de Javier' for k in ['amigas javier','amigas javi']},
 **{k:'Ricardo (amigos)' for k in ['ricardo amigo','amigo ricardo','senor amigo ricardo']},
 **{k:'Sayo' for k in ['sayo','sayos']},
}
NETWORK={ # normalized -> anchor
 **{k:'Gus' for k in ['senor gus','hermana gus','hermana de gus','amigas gus','amigos gus','prima gus','sobrino gus','silvia gus','andrea gus gus','cortesias gus','amiga gus']},
 **{k:'Lalo' for k in ['tio lalo','amigo lalo','amigos lalo','amiga lalo','compas lalo','amigos papa lalo']},
 **{k:'Javier Vaquera' for k in ['amigo vaquera','amigos vaquera','compa vaquera','ale mesa vaquera','amigos javier','amiga javier','amigas javier','amigas javi','compa javier','amigo javier','papa javier','papas javi']},
 **{k:'Izela' for k in ['prima isela','hermana izela','hermana isela','primos isela','amiga isela','amigo isela','mesa amigos isela','compa isela']},
 **{k:'Memo' for k in ['prima memo','primos memo','amigas prima memo','compas memo','amigo memo']},
 **{k:'Teresa' for k in ['amigo teresa','compas teresa']},
 **{k:'Karla' for k in ['hermano de karla']},
 **{k:'Ricardo Rojas' for k in ['ricardo amigo','amigo ricardo','senor amigo ricardo']},
 **{k:'Randy Patrón' for k in ['amigo randy']},
 **{k:'Shantal' for k in ['amigo shantal']},
 **{k:'Cecy' for k in ['amigos cecy']},
 **{k:'Susy' for k in ['primos susy']},
 **{k:'Lety' for k in ['maigos lety']},
 **{k:'Martín del Hoyo' for k in ['amigos martin']},
 **{k:'Mary' for k in ['amigos mary']},
 **{k:'Estefanía' for k in ['amigos estefania']},
 **{k:'Hugo' for k in ['compa hugo']},
 **{k:'Silverio' for k in ['compa silverio']},
 **{k:'Pollo' for k in ['compa pollo']},
 **{k:'Scarlett' for k in ['prima scarlett']},
}
GEN_EXACT=set('''senor chavos chicas chavo pareja senores morros don senora seno chicos chavas chava muchacho muchachos hermana amigos amigas amiga amigo amigaaas compa compas companeros compaas comp compi morro morrooos chaqvos cahvo chavisa chics chinos m1 ny uni plaza cafe caf futbol carro publica periquera sombrero barra verde chv cachucha esquina cabello largo familia banos vecino joven nueva nuevos otros india pokemon poke lentes barra gooo kk l h lk ll fgd se nan lrl jb lop gug paej inge ingeniero amigos amarillo conac negro gordi rata pelo camello yuca gacelas don bigote dom amigos hermana amigo pokemon amigo don amigo papa amigos pap amigos coo prima senooooor'''.split('\n')[0].split())
GEN_EXACT|={'verde chv','cachucha esquina','cabello largo','familia banos','lentes barra','amigos amarillo','don bigote','amigos hermana','amigo pokemon','amigo don','amigo papa','amigos pap','amigos coo','morras buchonas','morros audi','morros fondo bano'}
GEN_PREFIX=('senor ','senores ','chica ','chicas ','chavo ','chavos ','chava ','entrada','entrando','blanco ','compa ','compas ')
def classify(n):
    if n in MERGE: name=MERGE[n]
    elif n in NETWORK and n not in GEN_EXACT: name=n.title()
    elif n in GEN_EXACT or n.startswith(GEN_PREFIX) or n=='': return ('Genérico',None)
    else: name=n.title()
    return ('Conocido',name)
res=df.n.map(classify)
df['tipo']=[r[0] for r in res]; df['cliente']=[r[1] for r in res]
df['red']=df.n.map(NETWORK)
# registered always known
df.loc[df.customer_id.notna(),'tipo']='Conocido'
df['opened']=pd.to_datetime(df.opened_mx); df['op']=df.opened-pd.Timedelta(hours=6)
df['mes']=df.op.dt.strftime('%Y-%m'); df['dia']=df.op.dt.date
df.to_pickle('df.pkl')
print(df.tipo.value_counts())
print(sorted(df[df.tipo=='Genérico'].n.unique()))
print(df[df.tipo=='Conocido'].cliente.nunique(),"conocidos distintos")
print(df[df.red.notna()].groupby('red').folio.count().sort_values(ascending=False))
