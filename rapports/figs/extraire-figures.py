import pymupdf as fitz, os, subprocess
S=os.path.expanduser('~/site/accueil/')
LM=subprocess.check_output(['kpsewhich','lmroman10-regular.otf']).decode().strip()
font=fitz.Font(fontfile=LM)
B={'robot':[(1,(310,320,553,453)),(2,(43,40,285,176)),(2,(43,234,285,398)),(3,(43,40,286,224))],
'quantique':[(2,(43,40,285,158)),(2,(310,40,553,204)),(3,(43,40,285,210))],
'slic':[(4,(43,40,553,144)),(4,(43,190,553,370)),(4,(43,413,285,617)),(5,(43,40,553,261)),(6,(43,40,285,315))]}
# texte -> (nouveau, alignement)
T={'(a) Notre SLIC,':('(a) Our SLIC,','R'),'(c) Notre SLIC,':('(c) Our SLIC,','R'),'(d) Notre SLIC,':('(d) Our SLIC,','R'),
'Compacité':('Compactness','R'),'Erreur de sous-segmentation':('Undersegmentation error','R'),
'(a) Influence de':('(a) Effect of','R'),'(b) Influence de':('(b) Effect of','R'),'Notre SLIC':('Our SLIC','L'),
'Nombre final de superpixels (':('Final number of superpixels (','R'),'demandé (':(' requested (','F'),
'Temps (s, échelle log)':('Time (s, log scale)','C'),'(c) Temps de calcul':('(c) Runtime','C'),
'(c) Référence':('(c) Ground truth','C'),'(b) Bords spectraux':('(b) Spectral edges','C'),'par superpixel':(' per superpixel','L'),'Superpixels SLIC':('SLIC superpixels','L'),
'Écart-type spectral moyen':('Mean spectral std. dev.','R'),'Nombre de régions':('Number of regions','C'),
'(d) Homogénéité spectrale':('(d) Spectral homogeneity','C'),'Grille régulière':('Regular grid','L'),
'(a) IRM,':('(a) MRI,','R'),'(b) IRM,':('(b) MRI,','R'),'(c) Sphère,':('(c) Sphere,','R'),'(d) Sphère,':('(d) Sphere,','R'),';':('.','L')}
for f,L in B.items():
    for n,(pg,box) in enumerate(L,1):
        d=fitz.open(S+f'rapport-{f}.pdf'); d.select([pg-1]); p=d[0]; r=fitz.Rect(*box); P=p.rect
        ins=[]
        if f=='slic':
            for b in p.get_text('dict',clip=r)['blocks']:
                for l in b.get('lines',[]):
                    for s in l['spans']:
                        t=s['text'].strip()
                        if t in T:
                            bb=fitz.Rect(s['bbox']); ins.append((T[t],bb,s['size'],l['dir'],s['origin']))
                            sh=fitz.Rect(bb.x0+.4,bb.y0+1.5,bb.x1-.4,bb.y1-1.5) if l['dir'][0]==1 else fitz.Rect(bb.x0+1.5,bb.y0+.4,bb.x1-1.5,bb.y1-.4)
                            p.add_redact_annot(sh)
        p.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE,graphics=fitz.PDF_REDACT_LINE_ART_NONE)
        for o in [fitz.Rect(P.x0,P.y0,P.x1,r.y0-2),fitz.Rect(P.x0,r.y1+2,P.x1,P.y1),fitz.Rect(P.x0,r.y0-2,r.x0-2,r.y1+2),fitz.Rect(r.x1+2,r.y0-2,P.x1,r.y1+2)]:
            p.add_redact_annot(o)
        p.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE,graphics=fitz.PDF_REDACT_LINE_ART_NONE)
        p.insert_font(fontname='LM',fontfile=LM)
        for (new,al),bb,size,dr,org in ins:
            if al=='R': new+=' '
            w=font.text_length(new,size)
            if dr[0]==1:
                if al=='F':
                    size*=bb.width/w; w=bb.width; al='L'
                x={'L':bb.x0,'R':bb.x1-w,'C':(bb.x0+bb.x1)/2-w/2}[al]
                p.insert_text((x,org[1]),new,fontname='LM',fontsize=size)
            else:
                y={'L':bb.y1,'R':bb.y0+w,'C':(bb.y0+bb.y1)/2+w/2}[al]
                p.insert_text((org[0],y),new,fontname='LM',fontsize=size,rotate=90)
        p.set_cropbox(r); d.save(f'figs/{f}-{n}.pdf',garbage=4,deflate=True)
