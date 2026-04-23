// CsvImportModal — extraction S2.12 depuis CollabPortal.jsx L4881-5197
// Responsabilité : import CSV de masse des contacts (4 étapes : upload →
// mapping → preview → importing → result). Accessible depuis tout onglet.
//
// Ouverture : setCsvImportModal({ step: "upload" }) depuis CRM / Pipeline.
// Fermeture : setCsvImportModal(null).
//
// Flow métier — STRICTEMENT inchangé, recopie verbatim :
//   1. upload  : drag & drop OU click → FileReader.readAsText UTF-8, limite
//      10 Mo + 50 000 lignes, detect sep (tab/;/,) sur 1ʳᵉ ligne, parse RFC-
//      style (quotes doublés), auto-mapping heuristique par nom de colonne
//      (14 champs std : civilite, firstname, lastname, email, phone, company,
//      address, city, zip, notes, source, tags, siret, tva) puis fallback
//      vers contactFieldDefs existants, puis "custom nouveau" si data, sinon
//      "ignore".
//   2. mapping : chaque colonne → select (ignore / champ std / champ perso
//      existant / nouveau perso) ; si custom : inputs label + select type
//      (text/number/date/boolean). Badge AUTO si mapping dérivé de
//      l'heuristique.
//   3. preview : stats (toImport / duplicates / errors / customFields),
//      table des 20 1ʳᵉˢ lignes avec surlignage rouge (erreur) / orange
//      (doublon), radio dupMode (skip / merge / replace), liste champs
//      perso détectés, SELECT colonne pipeline cible (targetStage, 7 stages
//      défaut + pipelineStages custom).
//      Validation ligne : email doit matcher regex, phone doit matcher
//      ^\+?\d{6,20}$ (nettoyage non-digit), ligne vide (ni nom ni email
//      ni téléphone) = erreur.
//      Doublons DB : POST /api/data/contacts/check-duplicates avec liste
//      emails+phones, cross-check avec dupEmails/dupPhones retournés.
//   4. importing : spinner modal fermé à onClose inerte.
//   5. result : affichage stats serveur (imported / merged / replaced /
//      skipped / errors / customFieldsCreated) + errorDetails 20 premières.
//      Succès → refetch contacts + contact-fields pour refresh local.
//
// PARSING CSV / MAPPING / PREVIEW — 100 % inchangés, copie caractère-à-
// caractère de l'IIFE d'origine. Aucune logique métier modifiée.
//
// OWNERSHIP :
//   - State `csvImportModal` reste owned par CollabPortal (useState L78) —
//     le modal consomme `csvImportModal` + `setCsvImportModal` via context.
//   - `FileReader` + `processFile` : déclarés DANS le composant extrait (pas
//     dépendance CollabPortal, FileReader est une API browser native ; rester
//     dans le modal simplifie le rollback et aligne la responsabilité).
//   - Handlers d'upload (drag/drop, click, processFile) : restent dans le
//     modal — closures sur `cim`, `setCsvImportModal`, `contactFieldDefs`
//     (via context).
//   - Handler d'import final (POST /api/data/contacts/import-batch) : reste
//     dans le modal, appelle `setContacts` / `setContactFieldDefs` via
//     context pour refresh après succès.
//
// DEPENDANCES context (8) : csvImportModal, setCsvImportModal,
//   contactFieldDefs, setContactFieldDefs, pipelineStages, company,
//   setContacts, showNotif.
//
// DEPENDANCES imports directs : React, T, Modal/Btn/I, api.
//
// SHAPE `csvImportModal` — objet libre non typé, step-piloté :
//   { step: "upload"|"mapping"|"preview"|"importing"|"result",
//     filename, headers, rawRows, sep, mapping, duplicates, rowErrors,
//     dupMode, targetStage, result, error }
//
// ROLLBACK ISOLÉ : `git revert <hash>` suffit. Le modal vit dans un seul
// fichier, le wire dans CollabPortal est 1 import + 1 balise JSX (pas de
// nouvel entry provider — tous les symboles consommés étaient déjà exposés).

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Modal } from "../../../shared/ui";
import { api } from "../../../shared/services/api";
import { useCollabContext } from "../context/CollabContext";

const CsvImportModal = () => {
  const {
    csvImportModal, setCsvImportModal,
    contactFieldDefs, setContactFieldDefs,
    pipelineStages,
    company,
    setContacts,
    showNotif,
  } = useCollabContext();

  if (!csvImportModal) return null;

  const cim = csvImportModal;
  const T2 = { card:T.card, bg:T.bg, text:T.text, text2:T.text2, border:T.border, accent:T.accent };
  const STANDARD_FIELDS = [
    {key:"civilite",label:"Civilité"},{key:"firstname",label:"Prénom"},{key:"lastname",label:"Nom"},
    {key:"email",label:"Email"},{key:"phone",label:"Téléphone"},{key:"company",label:"Entreprise"},
    {key:"address",label:"Adresse"},{key:"city",label:"Ville"},{key:"zip",label:"Code postal"},
    {key:"notes",label:"Notes"},{key:"source",label:"Source"},{key:"tags",label:"Tags"},
    {key:"siret",label:"SIRET"},{key:"tva",label:"TVA"}
  ];
  const FIELD_TYPES = [{v:"text",l:"Texte"},{v:"number",l:"Nombre"},{v:"date",l:"Date"},{v:"boolean",l:"Oui/Non"}];
  const norm = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  const slugify = s => norm(s).replace(/[^a-z0-9]/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,"");

  function processFile(file){
    if(file.size>10*1024*1024){setCsvImportModal({...cim,error:"Fichier trop volumineux (max 10 Mo)"});return;}
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const text=ev.target.result;
        const lines=text.split(/\r?\n/).filter(l=>l.trim());
        if(lines.length<2){setCsvImportModal({...cim,error:"Fichier vide ou invalide"});return;}
        if(lines.length-1>50000){setCsvImportModal({...cim,error:"Trop de lignes (max 50 000)"});return;}
        const firstLine=lines[0];
        const sep=firstLine.includes("\t")?"\t":firstLine.includes(";")?";":",";
        const parseRow=(line)=>{
          const vals=[];let cur="",inQ=false;
          for(let j=0;j<line.length;j++){
            const ch=line[j];
            if(inQ){if(ch==='"'&&line[j+1]==='"'){cur+='"';j++;}else if(ch==='"'){inQ=false;}else{cur+=ch;}}
            else{if(ch==='"'){inQ=true;}else if(ch===sep){vals.push(cur.trim());cur="";}else{cur+=ch;}}
          }
          vals.push(cur.trim());return vals;
        };
        const headers=parseRow(lines[0]).map(h=>h.replace(/^"|"$/g,"").replace(/^\uFEFF/,"").trim());
        const rawRows=[];
        for(let i=1;i<lines.length;i++){
          const vals=parseRow(lines[i]);
          if(vals.every(v=>!v))continue;
          rawRows.push(vals);
        }
        const fieldDefs=[
          {key:"civilite",match:["civilite","titre","title","civ","gender"]},
          {key:"firstname",match:["prenom","firstname","first_name","first name","given"]},
          {key:"lastname",match:["nom","name","lastname","last_name","last name","family","surname"]},
          {key:"email",match:["email","e-mail","mail","courriel"]},
          {key:"phone",match:["telephone","tel","phone","mobile","portable","numero"]},
          {key:"company",match:["entreprise","societe","company","organization","organisation","raison sociale"]},
          {key:"address",match:["adresse","address","rue","street"]},
          {key:"city",match:["ville","city","commune","localite"]},
          {key:"zip",match:["postal","code postal","cp","zip","zipcode"]},
          {key:"notes",match:["notes","note","commentaire","comment","remarque","description"]},
          {key:"source",match:["source","origine","origin","provenance","canal"]},
          {key:"tags",match:["tags","tag","categorie","type","label"]},
          {key:"siret",match:["siret","siren"]},
          {key:"tva",match:["tva","vat","tax"]}
        ];
        const mapping={};
        const usedFields=new Set();
        headers.forEach((h,idx)=>{
          const hn=norm(h);
          for(const fd of fieldDefs){
            if(usedFields.has(fd.key))continue;
            if(fd.match.some(m=>hn===m||hn.includes(m))){
              mapping[idx]={field:fd.key,auto:true};
              usedFields.add(fd.key);
              break;
            }
          }
          if(!mapping[idx]){
            const existingCf=(contactFieldDefs||[]).find(d=>norm(d.label)===hn||d.fieldKey===slugify(h));
            if(existingCf){mapping[idx]={field:"custom",customLabel:existingCf.label,customKey:existingCf.fieldKey,customType:existingCf.fieldType||"text",auto:true};}
          }
          if(!mapping[idx]){
            const hasData=rawRows.some(r=>r[idx]&&r[idx].trim());
            if(hasData){mapping[idx]={field:"custom",customLabel:h,customKey:slugify(h),customType:"text",auto:false};}
            else{mapping[idx]={field:"ignore",auto:true};}
          }
        });
        setCsvImportModal({step:"mapping",filename:file.name,headers,rawRows,sep,mapping});
      }catch(err){setCsvImportModal({...cim,error:"Erreur lecture: "+err.message});}
    };
    reader.readAsText(file,"UTF-8");
  }

  // STEP 1: UPLOAD
  if(cim.step==="upload") return (
    <Modal open={true} onClose={()=>setCsvImportModal(null)} title="Import CSV — Chargement" width={560}>
      <div style={{padding:16,textAlign:"center"}}>
        <div style={{border:`2px dashed ${T2.border}`,borderRadius:12,padding:40,marginBottom:16,cursor:"pointer",background:T2.bg}}
          onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor=T2.accent;}}
          onDragLeave={e=>{e.currentTarget.style.borderColor=T2.border;}}
          onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor=T2.border;const f=e.dataTransfer.files[0];if(f)processFile(f);}}
          onClick={()=>{const inp=document.createElement("input");inp.type="file";inp.accept=".csv,.txt,.tsv";inp.onchange=ev=>{const f=ev.target.files[0];if(f)processFile(f);};inp.click();}}>
          <I n="upload-cloud" s={48} style={{color:T2.text2,marginBottom:12}}/>
          <p style={{fontSize:16,fontWeight:600,color:T2.text}}>Glissez un fichier CSV ici</p>
          <p style={{fontSize:13,color:T2.text2}}>ou cliquez pour parcourir · .csv .txt .tsv · max 10 Mo</p>
        </div>
        {cim.error && <p style={{color:"#EF4444",fontSize:13,marginTop:8}}>{cim.error}</p>}
      </div>
    </Modal>
  );

  // STEP 2: MAPPING
  if(cim.step==="mapping") return (
    <Modal open={true} onClose={()=>setCsvImportModal(null)} title={`Import CSV — Mapping (${cim.filename})`} width={720}>
      <div style={{maxHeight:"70vh",overflow:"auto",padding:16}}>
        <p style={{fontSize:13,color:T2.text2,marginBottom:16}}>{cim.rawRows.length} lignes · séparateur: {cim.sep==="\t"?"Tab":cim.sep===","?"Virgule":"Point-virgule"}</p>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {cim.headers.map((h,idx)=>{
            const m=cim.mapping[idx]||{field:"ignore"};
            return (
              <div key={idx} style={{display:"grid",gridTemplateColumns:"200px 40px 1fr",gap:8,alignItems:"center",padding:"8px 12px",borderRadius:8,background:m.field==="ignore"?T2.bg:`${T2.accent}08`,border:`1px solid ${m.field==="ignore"?T2.border:T2.accent+"30"}`}}>
                <div style={{fontSize:13,fontWeight:600,color:T2.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={h}>
                  {h}
                  <span style={{fontSize:11,color:T2.text2,marginLeft:6}}>ex: {(cim.rawRows[0]||[])[idx]||"—"}</span>
                </div>
                <span style={{fontSize:12,color:T2.text2,textAlign:"center"}}>→</span>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                  <select value={m.field==="custom"?"custom":m.field} style={{flex:1,padding:"6px 8px",borderRadius:6,border:`1px solid ${T2.border}`,background:T2.card,color:T2.text,fontSize:13}}
                    onChange={e=>{
                      const val=e.target.value;
                      const newMapping={...cim.mapping};
                      if(val==="ignore") newMapping[idx]={field:"ignore"};
                      else if(val==="custom") newMapping[idx]={field:"custom",customLabel:h,customKey:slugify(h),customType:"text"};
                      else newMapping[idx]={field:val};
                      setCsvImportModal({...cim,mapping:newMapping});
                    }}>
                    <option value="ignore">— Ignorer —</option>
                    <optgroup label="Champs standard">
                      {STANDARD_FIELDS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
                    </optgroup>
                    {(contactFieldDefs||[]).length>0 && <optgroup label="Champs perso existants">
                      {(contactFieldDefs||[]).map(d=><option key={d.fieldKey} value="custom">{d.label}</option>)}
                    </optgroup>}
                    <option value="custom">+ Nouveau champ perso</option>
                  </select>
                  {m.field==="custom" && (
                    <>
                      <input value={m.customLabel||""} placeholder="Nom du champ" style={{width:120,padding:"5px 8px",borderRadius:6,border:`1px solid ${T2.border}`,fontSize:12,background:T2.card,color:T2.text}}
                        onChange={e=>{const newMapping={...cim.mapping};newMapping[idx]={...m,customLabel:e.target.value,customKey:slugify(e.target.value)};setCsvImportModal({...cim,mapping:newMapping});}}/>
                      <select value={m.customType||"text"} style={{width:80,padding:"5px 8px",borderRadius:6,border:`1px solid ${T2.border}`,fontSize:12,background:T2.card,color:T2.text}}
                        onChange={e=>{const newMapping={...cim.mapping};newMapping[idx]={...m,customType:e.target.value};setCsvImportModal({...cim,mapping:newMapping});}}>
                        {FIELD_TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
                      </select>
                    </>
                  )}
                  {m.auto && <span style={{fontSize:10,color:"#22C55E",fontWeight:600}}>AUTO</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:20}}>
          <Btn onClick={()=>setCsvImportModal(null)}>Annuler</Btn>
          <Btn primary onClick={()=>{
            const mapped=Object.values(cim.mapping).filter(m=>m.field!=="ignore");
            if(!mapped.length){showNotif("Mappez au moins une colonne","danger");return;}
            const emailIdx=Object.entries(cim.mapping).find(([,m])=>m.field==="email");
            const phoneIdx=Object.entries(cim.mapping).find(([,m])=>m.field==="phone");
            const csvEmails=emailIdx?cim.rawRows.map(r=>(r[emailIdx[0]]||"").toLowerCase().trim()).filter(Boolean):[];
            const csvPhones=phoneIdx?cim.rawRows.map(r=>(r[phoneIdx[0]]||"").replace(/\D/g,"")).filter(Boolean):[];
            const rowErrors=[];
            const nameIdx=Object.entries(cim.mapping).find(([,m])=>m.field==="firstname"||m.field==="lastname");
            cim.rawRows.forEach((r,i)=>{
              const em=emailIdx?(r[emailIdx[0]]||"").trim():"";
              const ph=phoneIdx?(r[phoneIdx[0]]||"").trim():"";
              const nm=nameIdx?(r[nameIdx[0]]||"").trim():"";
              if(!nm&&!em&&!ph) rowErrors.push({row:i,reason:"Ligne vide (ni nom, ni email, ni téléphone)"});
              else if(em&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) rowErrors.push({row:i,reason:`Email invalide: ${em}`});
              else if(ph&&!/^\+?\d{6,20}$/.test(ph.replace(/[\s\-\.\(\)]/g,""))) rowErrors.push({row:i,reason:`Téléphone invalide: ${ph}`});
            });
            api("/api/data/contacts/check-duplicates",{method:"POST",body:{emails:csvEmails,phones:csvPhones}}).then(dupResult=>{
              const dbDupEmails=new Set((dupResult?.dupEmails||[]).map(e=>e.toLowerCase()));
              const dbDupPhones=new Set((dupResult?.dupPhones||[]).map(p=>(p||"").replace(/\D/g,"")));
              const duplicates=[];
              cim.rawRows.forEach((r,i)=>{
                const em=emailIdx?(r[emailIdx[0]]||"").toLowerCase().trim():"";
                const ph=phoneIdx?(r[phoneIdx[0]]||"").replace(/\D/g,""):"";
                if((em&&dbDupEmails.has(em))||(ph&&dbDupPhones.has(ph))) duplicates.push(i);
              });
              setCsvImportModal({...cim,step:"preview",duplicates,rowErrors,dupMode:"skip"});
            }).catch(()=>{setCsvImportModal({...cim,step:"preview",duplicates:[],rowErrors,dupMode:"skip"});});
          }}><I n="arrow-right" s={14}/> Aperçu</Btn>
        </div>
      </div>
    </Modal>
  );

  // STEP 3: PREVIEW
  if(cim.step==="preview"){
    const mapped=Object.entries(cim.mapping).filter(([,m])=>m.field!=="ignore");
    const validRows=cim.rawRows.length-(cim.rowErrors||[]).length;
    const dupsCount=(cim.duplicates||[]).length;
    const errCount=(cim.rowErrors||[]).length;
    const toImport=cim.dupMode==="skip"?validRows-dupsCount:validRows;
    const customFields=Object.values(cim.mapping).filter(m=>m.field==="custom"&&m.customLabel);
    return (
      <Modal open={true} onClose={()=>setCsvImportModal(null)} title={`Import CSV — Aperçu (${cim.filename})`} width={900}>
        <div style={{maxHeight:"75vh",overflow:"auto",padding:16}}>
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:100,padding:"10px 14px",borderRadius:8,background:"#22C55E12",border:"1px solid #22C55E30",textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:"#22C55E"}}>{toImport}</div><div style={{fontSize:11,color:T2.text2}}>À importer</div></div>
            <div style={{flex:1,minWidth:100,padding:"10px 14px",borderRadius:8,background:dupsCount?"#F59E0B12":T2.bg,border:`1px solid ${dupsCount?"#F59E0B30":T2.border}`,textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:dupsCount?"#F59E0B":T2.text2}}>{dupsCount}</div><div style={{fontSize:11,color:T2.text2}}>Doublons</div></div>
            <div style={{flex:1,minWidth:100,padding:"10px 14px",borderRadius:8,background:errCount?"#EF444412":T2.bg,border:`1px solid ${errCount?"#EF444430":T2.border}`,textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:errCount?"#EF4444":T2.text2}}>{errCount}</div><div style={{fontSize:11,color:T2.text2}}>Erreurs</div></div>
            {customFields.length>0 && <div style={{flex:1,minWidth:100,padding:"10px 14px",borderRadius:8,background:"#8B5CF612",border:"1px solid #8B5CF630",textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:"#8B5CF6"}}>{customFields.length}</div><div style={{fontSize:11,color:T2.text2}}>Champs perso</div></div>}
          </div>
          <div style={{overflow:"auto",marginBottom:16,border:`1px solid ${T2.border}`,borderRadius:8}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:T2.bg}}>
                <th style={{padding:"8px 6px",borderBottom:`1px solid ${T2.border}`,fontSize:11,color:T2.text2,textAlign:"left"}}>#</th>
                {mapped.map(([idx,m])=><th key={idx} style={{padding:"8px 6px",borderBottom:`1px solid ${T2.border}`,fontSize:11,color:m.field==="custom"?"#8B5CF6":T2.accent,textAlign:"left",whiteSpace:"nowrap"}}>{m.field==="custom"?m.customLabel:STANDARD_FIELDS.find(f=>f.key===m.field)?.label||m.field}</th>)}
              </tr></thead>
              <tbody>{cim.rawRows.slice(0,20).map((r,i)=>{
                const isDup=(cim.duplicates||[]).includes(i);const hasErr=(cim.rowErrors||[]).find(e=>e.row===i);
                return (<tr key={i} style={{background:hasErr?"#EF444408":isDup?"#F59E0B08":"transparent"}}><td style={{padding:"6px",borderBottom:`1px solid ${T2.border}22`,color:T2.text2,fontSize:11}}>{isDup&&"⚠ "}{hasErr&&"✗ "}{i+2}</td>{mapped.map(([idx])=><td key={idx} style={{padding:"6px",borderBottom:`1px solid ${T2.border}22`,color:T2.text,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r[idx]||""}</td>)}</tr>);
              })}</tbody>
            </table>
            {cim.rawRows.length>20 && <p style={{padding:8,fontSize:11,color:T2.text2,textAlign:"center"}}>... et {cim.rawRows.length-20} lignes de plus</p>}
          </div>
          {dupsCount>0 && <div style={{marginBottom:16,padding:12,borderRadius:8,background:"#F59E0B08",border:"1px solid #F59E0B20"}}>
            <p style={{fontSize:13,fontWeight:600,color:"#F59E0B",marginBottom:8}}>{dupsCount} doublon{dupsCount>1?"s":""}</p>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {[{v:"skip",l:"Ignorer les doublons",d:"Les contacts existants ne seront pas modifiés"},{v:"merge",l:"Fusionner",d:"Mettre à jour uniquement les champs vides"},{v:"replace",l:"Remplacer",d:"Écraser les contacts existants"}].map(opt=>(
                <label key={opt.v} style={{display:"flex",gap:8,alignItems:"flex-start",cursor:"pointer",padding:"6px 8px",borderRadius:6,background:cim.dupMode===opt.v?`${T2.accent}12`:"transparent"}}>
                  <input type="radio" name="csvDupMode" checked={cim.dupMode===opt.v} onChange={()=>setCsvImportModal({...cim,dupMode:opt.v})} style={{marginTop:2}}/>
                  <div><span style={{fontSize:13,fontWeight:600,color:T2.text}}>{opt.l}</span><br/><span style={{fontSize:11,color:T2.text2}}>{opt.d}</span></div>
                </label>
              ))}
            </div>
          </div>}
          {customFields.length>0 && <div style={{marginBottom:16,padding:12,borderRadius:8,background:"#8B5CF608",border:"1px solid #8B5CF620"}}>
            <p style={{fontSize:13,fontWeight:600,color:"#8B5CF6",marginBottom:6}}>{customFields.length} champ{customFields.length>1?"s":""} perso</p>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{customFields.map((cf,i)=><span key={i} style={{fontSize:11,padding:"3px 8px",borderRadius:4,background:"#8B5CF618",color:"#8B5CF6"}}>{cf.customLabel} ({FIELD_TYPES.find(t=>t.v===cf.customType)?.l||"Texte"})</span>)}</div>
          </div>}
          {/* Colonne pipeline de destination */}
          <div style={{marginBottom:16,padding:12,borderRadius:8,background:'#2563EB08',border:'1px solid #2563EB20'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <I n="columns" s={16} style={{color:'#2563EB'}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:T2.text,marginBottom:2}}>Colonne pipeline de destination</div>
                <div style={{fontSize:11,color:T2.text2}}>Les contacts importés apparaîtront directement dans cette colonne du pipeline live.</div>
              </div>
              <select value={cim.targetStage||'nouveau'} onChange={e=>setCsvImportModal({...cim,targetStage:e.target.value})} style={{padding:'8px 12px',borderRadius:8,border:'1px solid #2563EB30',background:T2.card,fontSize:13,fontWeight:600,color:'#2563EB',cursor:'pointer',minWidth:160}}>
                {[{id:'nouveau',label:'Nouveau',color:'#2563EB'},{id:'contacte',label:'En discussion',color:'#F59E0B'},{id:'qualifie',label:'Intéressé',color:'#7C3AED'},{id:'rdv_programme',label:'RDV Programmé',color:'#0EA5E9'},{id:'nrp',label:'NRP',color:'#EF4444'},{id:'client_valide',label:'Client Validé',color:'#22C55E'},{id:'perdu',label:'Perdu',color:'#64748B'},...((pipelineStages)||[]).map(s=>({id:s.id,label:s.label||s.id}))].map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{display:"flex",justifyContent:"space-between",gap:8,marginTop:16}}>
            <Btn onClick={()=>setCsvImportModal({...cim,step:"mapping"})}><I n="arrow-left" s={14}/> Retour</Btn>
            <Btn primary onClick={()=>{
              const errorRowSet=new Set((cim.rowErrors||[]).map(e=>e.row));
              const skipDupSet=new Set(cim.dupMode==="skip"?(cim.duplicates||[]):[]);
              const contactsToSend=[];const customDefs=[];
              const customFieldMappings=Object.entries(cim.mapping).filter(([,m])=>m.field==="custom"&&m.customLabel);
              customFieldMappings.forEach(([,m])=>{if(!customDefs.find(d=>d.fieldKey===m.customKey)){customDefs.push({label:m.customLabel,fieldKey:m.customKey,fieldType:m.customType||"text"});}});
              for(let i=0;i<cim.rawRows.length;i++){
                if(errorRowSet.has(i)||skipDupSet.has(i))continue;
                const r=cim.rawRows[i];const ct={pipeline_stage:cim.targetStage||"nouveau",source:"csv"};const cf=[];
                for(const [idx,m] of Object.entries(cim.mapping)){
                  if(m.field==="ignore")continue;const val=(r[parseInt(idx)]||"").trim();if(!val)continue;
                  if(m.field==="custom"){cf.push({key:m.customKey,value:val});}
                  else if(m.field==="tags"){ct.tags_json=JSON.stringify(val.split(/[,;|]/).map(t=>t.trim()).filter(Boolean));}
                  else{ct[m.field]=val;}
                }
                ct.name=[ct.firstname,ct.lastname].filter(Boolean).join(" ")||ct.email||"Sans nom";
                ct.custom_fields_json=JSON.stringify(cf);
                contactsToSend.push(ct);
              }
              console.log('[CSV IMPORT] Sending',contactsToSend.length,'contacts, dupMode:',cim.dupMode,'customDefs:',customDefs.length);
              setCsvImportModal({...cim,step:"importing"});
              api("/api/data/contacts/import-batch",{method:"POST",body:{contacts:contactsToSend,dupMode:cim.dupMode==="skip"?"skip":cim.dupMode,customFieldDefs:customDefs}})
                .then(result=>{
                  console.log('[CSV IMPORT] Result:',result);
                  if(result&&result.error){setCsvImportModal({...cim,step:"result",result:{error:result.error}});return;}
                  setCsvImportModal({...cim,step:"result",result});
                  api("/api/data/contacts?companyId="+company.id).then(r=>{if(Array.isArray(r))setContacts(r);});
                  api("/api/contact-fields").then(r=>{if(Array.isArray(r))setContactFieldDefs(r);});
                })
                .catch(err=>{console.error('[CSV IMPORT] Error:',err);setCsvImportModal({...cim,step:"result",result:{error:err.message||"Erreur serveur — vérifiez la console (F12)"}});});
            }}><I n="check" s={14}/> Importer {toImport} contact{toImport>1?"s":""}</Btn>
          </div>
        </div>
      </Modal>
    );
  }

  // STEP IMPORTING
  if(cim.step==="importing") return (<Modal open={true} onClose={()=>{}} title="Import en cours..." width={400}><div style={{padding:32,textAlign:"center"}}><div style={{fontSize:14,color:T2.text2}}>Import en cours, veuillez patienter...</div></div></Modal>);

  // STEP 4: RESULT
  if(cim.step==="result"){
    const r=cim.result||{};
    if(r.error) return (<Modal open={true} onClose={()=>setCsvImportModal(null)} title="Import CSV — Erreur" width={480}><div style={{padding:24,textAlign:"center"}}><div style={{fontSize:48,marginBottom:12}}>❌</div><p style={{fontSize:15,fontWeight:600,color:"#EF4444",marginBottom:8}}>Erreur</p><p style={{fontSize:13,color:T2.text2}}>{r.error}</p><Btn onClick={()=>setCsvImportModal(null)} style={{marginTop:16}}>Fermer</Btn></div></Modal>);
    return (
      <Modal open={true} onClose={()=>setCsvImportModal(null)} title="Import CSV — Résultat" width={560}>
        <div style={{padding:24}}>
          <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
            {r.imported>0&&<div style={{flex:1,minWidth:100,padding:"12px",borderRadius:8,background:"#22C55E12",border:"1px solid #22C55E30",textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:"#22C55E"}}>{r.imported}</div><div style={{fontSize:12,color:T2.text2}}>Importés</div></div>}
            {r.merged>0&&<div style={{flex:1,minWidth:100,padding:"12px",borderRadius:8,background:"#3B82F612",border:"1px solid #3B82F630",textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:"#3B82F6"}}>{r.merged}</div><div style={{fontSize:12,color:T2.text2}}>Fusionnés</div></div>}
            {r.replaced>0&&<div style={{flex:1,minWidth:100,padding:"12px",borderRadius:8,background:"#F59E0B12",border:"1px solid #F59E0B30",textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:"#F59E0B"}}>{r.replaced}</div><div style={{fontSize:12,color:T2.text2}}>Remplacés</div></div>}
            {(r.skipped||0)>0&&<div style={{flex:1,minWidth:100,padding:"12px",borderRadius:8,background:T2.bg,border:`1px solid ${T2.border}`,textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:T2.text2}}>{r.skipped}</div><div style={{fontSize:12,color:T2.text2}}>Ignorés</div></div>}
            {(r.errors||0)>0&&<div style={{flex:1,minWidth:100,padding:"12px",borderRadius:8,background:"#EF444412",border:"1px solid #EF444430",textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:"#EF4444"}}>{r.errors}</div><div style={{fontSize:12,color:T2.text2}}>Erreurs</div></div>}
            {(r.customFieldsCreated||0)>0&&<div style={{flex:1,minWidth:100,padding:"12px",borderRadius:8,background:"#8B5CF612",border:"1px solid #8B5CF630",textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,color:"#8B5CF6"}}>{r.customFieldsCreated}</div><div style={{fontSize:12,color:T2.text2}}>Champs perso</div></div>}
          </div>
          {r.errorDetails&&r.errorDetails.length>0&&<div style={{marginBottom:16,padding:12,borderRadius:8,background:"#EF444408",border:"1px solid #EF444420"}}>
            <p style={{fontSize:13,fontWeight:600,color:"#EF4444",marginBottom:6}}>Erreurs</p>
            {r.errorDetails.slice(0,20).map((e,i)=><p key={i} style={{fontSize:11,color:T2.text2}}>Ligne {e.row}: {e.error}</p>)}
          </div>}
          <div style={{display:"flex",justifyContent:"flex-end"}}><Btn primary onClick={()=>setCsvImportModal(null)}>Fermer</Btn></div>
        </div>
      </Modal>
    );
  }

  return null;
};

export default CsvImportModal;
