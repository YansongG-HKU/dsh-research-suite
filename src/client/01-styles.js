/**
 * dsh-research-suite — 01-styles
 *
 * One injected stylesheet. Colours follow the host theme through
 * prefers-color-scheme; the panel keeps the paper-and-ink feel of a lab notebook.
 */
    const CSS = `
.rsx-root{--rsx-bg:#f6f4ee;--rsx-surface:#fffdf9;--rsx-sunken:#efebe2;--rsx-ink:#1d2522;--rsx-muted:#6c7873;--rsx-faint:#98a29d;--rsx-line:#e2dcd0;--rsx-accent:#2f6f6a;--rsx-accent-soft:#e2efed;--rsx-ochre:#b4552f;--rsx-ochre-soft:#f7e8df;--rsx-bad:#b23a34;--rsx-bad-soft:#f8e3e1;--rsx-warn:#9a6d18;--rsx-warn-soft:#f7eed6;--rsx-ok:#2f7d4e;--rsx-ok-soft:#e3f1e7;--rsx-shadow:0 1px 2px rgba(29,37,34,.05),0 8px 24px rgba(29,37,34,.05);height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--rsx-bg);color:var(--rsx-ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:13px;line-height:1.5}
@media (prefers-color-scheme: dark){.rsx-root{--rsx-bg:#171a19;--rsx-surface:#1e2321;--rsx-sunken:#242a27;--rsx-ink:#e8ece9;--rsx-muted:#9aa8a2;--rsx-faint:#6f7d77;--rsx-line:#2f3733;--rsx-accent:#6fb3ab;--rsx-accent-soft:#20332f;--rsx-ochre:#d98a63;--rsx-ochre-soft:#33251e;--rsx-bad:#e07b74;--rsx-bad-soft:#33211f;--rsx-warn:#d3a95a;--rsx-warn-soft:#302917;--rsx-ok:#7fc397;--rsx-ok-soft:#1f3026;--rsx-shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.25)}}
.rsx-root *{box-sizing:border-box}
.rsx-root button{font:inherit;color:inherit}
.rsx-root ::selection{background:var(--rsx-accent-soft)}
.rsx-top{display:flex;align-items:center;gap:12px;padding:12px 18px;background:var(--rsx-surface);border-bottom:1px solid var(--rsx-line);flex-wrap:wrap}
.rsx-brand{display:flex;align-items:center;gap:9px;min-width:0}
.rsx-mark{width:28px;height:28px;border-radius:8px;background:var(--rsx-accent);color:var(--rsx-surface);display:flex;align-items:center;justify-content:center;flex:none}
.rsx-title{font-size:14px;font-weight:650;letter-spacing:.01em;white-space:nowrap}
.rsx-version{font-size:10px;color:var(--rsx-faint);border:1px solid var(--rsx-line);border-radius:99px;padding:1px 6px}
.rsx-top-spacer{flex:1}
.rsx-select{appearance:none;background:var(--rsx-sunken);border:1px solid var(--rsx-line);border-radius:8px;padding:6px 26px 6px 9px;font-size:12px;max-width:280px;cursor:pointer;color:var(--rsx-ink)}
.rsx-icon-btn{background:transparent;border:1px solid transparent;border-radius:7px;padding:5px 7px;cursor:pointer;color:var(--rsx-muted);display:inline-flex;align-items:center;gap:5px}
.rsx-icon-btn:hover{background:var(--rsx-sunken);color:var(--rsx-ink)}
.rsx-icon-btn[aria-pressed="true"]{background:var(--rsx-accent-soft);color:var(--rsx-accent)}
.rsx-nav{display:flex;gap:2px;padding:8px 14px 0;background:var(--rsx-surface);border-bottom:1px solid var(--rsx-line);flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin}
.rsx-tab{background:transparent;border:0;border-bottom:2px solid transparent;padding:7px 11px 8px;cursor:pointer;color:var(--rsx-muted);font-weight:550;display:inline-flex;align-items:center;gap:6px;flex:none}
.rsx-tab:hover{color:var(--rsx-ink)}
.rsx-tab[aria-selected="true"]{color:var(--rsx-accent);border-bottom-color:var(--rsx-accent)}
.rsx-count{font-size:10px;background:var(--rsx-sunken);border-radius:99px;padding:0 6px;color:var(--rsx-muted)}
.rsx-body{flex:1;overflow:auto;padding:16px 18px 32px}
.rsx-body-inner{max-width:1180px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.rsx-card{background:var(--rsx-surface);border:1px solid var(--rsx-line);border-radius:12px;box-shadow:var(--rsx-shadow)}
.rsx-card-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--rsx-line)}
.rsx-card-title{font-size:12px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;color:var(--rsx-muted)}
.rsx-card-body{padding:14px}
.rsx-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rsx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
@media (max-width:920px){.rsx-grid{grid-template-columns:1fr}}
.rsx-camps{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:9px}
.rsx-camp{text-align:left;background:var(--rsx-surface);border:1px solid var(--rsx-line);border-radius:10px;padding:10px 11px;cursor:pointer;display:flex;flex-direction:column;gap:5px;min-width:0}
.rsx-camp:hover{border-color:var(--rsx-accent)}
.rsx-camp[aria-current="true"]{border-color:var(--rsx-accent);background:var(--rsx-accent-soft)}
.rsx-camp-title{font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rsx-camp-meta{font-size:11px;color:var(--rsx-muted);display:flex;gap:6px;flex-wrap:wrap}
.rsx-h1{font-size:19px;font-weight:680;margin:0;line-height:1.3;letter-spacing:-.01em}
.rsx-sub{color:var(--rsx-muted);font-size:12px;margin:2px 0 0}
.rsx-badge{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;border-radius:99px;padding:1px 7px;border:1px solid transparent;white-space:nowrap}
.rsx-badge.ok{background:var(--rsx-ok-soft);color:var(--rsx-ok)}
.rsx-badge.bad{background:var(--rsx-bad-soft);color:var(--rsx-bad)}
.rsx-badge.warn{background:var(--rsx-warn-soft);color:var(--rsx-warn)}
.rsx-badge.muted{background:var(--rsx-sunken);color:var(--rsx-muted)}
.rsx-badge.accent{background:var(--rsx-accent-soft);color:var(--rsx-accent)}
.rsx-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
.rsx-stepper{display:flex;align-items:flex-start;gap:0;padding:4px 2px 0;overflow-x:auto}
.rsx-step{flex:1;min-width:64px;display:flex;flex-direction:column;align-items:center;gap:5px;position:relative;padding-bottom:4px}
.rsx-step::after{content:"";position:absolute;top:11px;left:50%;width:100%;height:2px;background:var(--rsx-line);z-index:0}
.rsx-step:last-child::after{display:none}
.rsx-step-dot{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:var(--rsx-sunken);color:var(--rsx-muted);border:2px solid var(--rsx-surface);z-index:1;box-shadow:0 0 0 1px var(--rsx-line)}
.rsx-step.ok .rsx-step-dot{background:var(--rsx-ok);color:#fff;box-shadow:0 0 0 1px var(--rsx-ok)}
.rsx-step.bad .rsx-step-dot{background:var(--rsx-bad);color:#fff;box-shadow:0 0 0 1px var(--rsx-bad)}
.rsx-step.current .rsx-step-dot{background:var(--rsx-accent);color:#fff;box-shadow:0 0 0 1px var(--rsx-accent)}
.rsx-step-label{font-size:10.5px;color:var(--rsx-muted);white-space:nowrap}
.rsx-step.current .rsx-step-label,.rsx-step.ok .rsx-step-label{color:var(--rsx-ink);font-weight:600}
.rsx-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
@media (max-width:700px){.rsx-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
.rsx-kpi{background:var(--rsx-sunken);border-radius:9px;padding:8px 10px}
.rsx-kpi b{display:block;font-size:17px;font-weight:680;line-height:1.2}
.rsx-kpi span{font-size:10.5px;color:var(--rsx-muted)}
.rsx-check{display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-bottom:1px dashed var(--rsx-line);font-size:12px}
.rsx-check:last-child{border-bottom:0}
.rsx-check-ico{width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;font-size:10px;margin-top:1px}
.rsx-check-ico.ok{background:var(--rsx-ok-soft);color:var(--rsx-ok)}
.rsx-check-ico.bad{background:var(--rsx-bad-soft);color:var(--rsx-bad)}
.rsx-check code{font-size:10.5px;background:var(--rsx-sunken);padding:0 4px;border-radius:4px}
.rsx-check-detail{color:var(--rsx-muted);font-size:11px}
.rsx-bar{height:6px;border-radius:99px;background:var(--rsx-sunken);overflow:hidden}
.rsx-bar-fill{height:100%;background:var(--rsx-accent);border-radius:99px}
.rsx-bar-fill.warn{background:var(--rsx-warn)}
.rsx-bar-fill.bad{background:var(--rsx-bad)}
.rsx-table-wrap{overflow:auto;border:1px solid var(--rsx-line);border-radius:10px;background:var(--rsx-surface);max-height:calc(100vh - 300px)}
.rsx-table{width:100%;border-collapse:collapse;font-size:11.5px}
.rsx-table th{position:sticky;top:0;background:var(--rsx-sunken);text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--rsx-muted);padding:7px 9px;border-bottom:1px solid var(--rsx-line);white-space:nowrap;z-index:1}
.rsx-table td{padding:7px 9px;border-bottom:1px solid var(--rsx-line);vertical-align:top}
.rsx-table tr:last-child td{border-bottom:0}
.rsx-table tr:hover td{background:var(--rsx-bg)}
.rsx-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px}
.rsx-trunc{max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rsx-prewrap{white-space:pre-wrap;word-break:break-word;max-width:520px}
.rsx-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:44px 20px;gap:10px;color:var(--rsx-muted)}
.rsx-empty h3{margin:0;font-size:15px;color:var(--rsx-ink)}
.rsx-empty p{margin:0;max-width:420px;font-size:12px}
.rsx-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--rsx-line);background:var(--rsx-surface);color:var(--rsx-ink);border-radius:8px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
.rsx-btn:hover{border-color:var(--rsx-accent);color:var(--rsx-accent)}
.rsx-btn.primary{background:var(--rsx-accent);border-color:var(--rsx-accent);color:#fff}
.rsx-btn.primary:hover{filter:brightness(1.06);color:#fff}
.rsx-btn.ghost{background:transparent;border-color:transparent;color:var(--rsx-muted)}
.rsx-btn.ghost:hover{background:var(--rsx-sunken);color:var(--rsx-ink)}
.rsx-btn.danger{color:var(--rsx-bad);border-color:var(--rsx-line)}
.rsx-btn:disabled{opacity:.5;cursor:not-allowed}
.rsx-root button:focus-visible,.rsx-root input:focus-visible,.rsx-root select:focus-visible,.rsx-root textarea:focus-visible,.rsx-root [tabindex]:focus-visible{outline:2px solid var(--rsx-accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.rsx-root *,.rsx-icon-btn.is-spinning svg{animation-duration:.001ms !important;animation-iteration-count:1 !important;transition:none !important}}
@media (max-width:700px){.rsx-top{padding:10px 12px;gap:8px}.rsx-select{max-width:100%;flex:1 1 160px}.rsx-brand .rsx-title{font-size:13px}.rsx-body{padding:12px 12px 28px}}
.rsx-tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:11px}
.rsx-tpl{display:flex;flex-direction:column;gap:7px;background:var(--rsx-surface);border:1px solid var(--rsx-line);border-radius:11px;padding:12px;box-shadow:var(--rsx-shadow)}
.rsx-tpl:hover{border-color:var(--rsx-accent)}
.rsx-tpl-title{font-weight:650;font-size:13px;display:flex;align-items:center;gap:7px}
.rsx-tpl-sum{font-size:11.5px;color:var(--rsx-muted);min-height:34px}
.rsx-chips{display:flex;flex-wrap:wrap;gap:4px}
.rsx-chip{font-size:10px;background:var(--rsx-sunken);border:1px solid transparent;border-radius:99px;padding:2px 8px;color:var(--rsx-muted)}
button.rsx-chip{cursor:pointer;font:inherit;font-size:10.5px;display:inline-flex;align-items:center;gap:5px}
button.rsx-chip:hover{color:var(--rsx-ink);border-color:var(--rsx-line)}
button.rsx-chip.on{background:var(--rsx-accent-soft);color:var(--rsx-accent);border-color:var(--rsx-accent)}
.rsx-toolbar{gap:8px;align-items:center}
.rsx-arch-list{display:flex;flex-direction:column;gap:7px}
.rsx-arch-row{display:flex;align-items:center;gap:10px;padding:9px 10px;background:var(--rsx-sunken);border:1px solid var(--rsx-line);border-radius:9px;min-width:0}
.rsx-issues summary{cursor:pointer;color:var(--rsx-muted);font-size:10.5px;white-space:nowrap}
.rsx-issues summary:hover{color:var(--rsx-ink)}
.rsx-issue-count{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:650}
.rsx-issues ul{margin:6px 0 0;padding-left:14px;display:flex;flex-direction:column;gap:3px;min-width:180px;max-width:320px}
.rsx-issues li{font-size:10.5px;color:var(--rsx-muted);overflow-wrap:anywhere}
.rsx-issues code{font-size:9.5px;border-radius:4px;padding:0 3px;background:var(--rsx-sunken);text-transform:uppercase}
.rsx-issue-error{color:var(--rsx-bad)}
.rsx-issue-warning{color:var(--rsx-warn)}
.rsx-issue-info{color:var(--rsx-muted)}
.rsx-icon-btn.is-spinning svg{animation:rsx-spin .9s linear infinite}
@keyframes rsx-spin{to{transform:rotate(360deg)}}
.rsx-tpl-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:4px}
.rsx-md{margin:0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.65;background:var(--rsx-sunken);border:1px solid var(--rsx-line);border-radius:10px;padding:14px;max-height:calc(100vh - 300px);overflow:auto}
.rsx-modal-ov{position:fixed;inset:0;background:rgba(20,26,24,.42);display:flex;align-items:center;justify-content:center;z-index:50;padding:18px}
.rsx-modal{background:var(--rsx-surface);border:1px solid var(--rsx-line);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.25);width:min(560px,100%);max-height:86vh;display:flex;flex-direction:column;overflow:hidden}
.rsx-modal.wide{width:min(760px,100%)}
.rsx-modal-head{display:flex;align-items:center;gap:10px;padding:13px 15px;border-bottom:1px solid var(--rsx-line);font-weight:650}
.rsx-modal-body{padding:15px;overflow:auto;display:flex;flex-direction:column;gap:11px}
.rsx-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:11px 15px;border-top:1px solid var(--rsx-line);background:var(--rsx-bg)}
.rsx-field{display:flex;flex-direction:column;gap:4px}
.rsx-field label{font-size:11px;font-weight:600;color:var(--rsx-muted)}
.rsx-input,.rsx-textarea{width:100%;border:1px solid var(--rsx-line);border-radius:8px;background:var(--rsx-bg);color:var(--rsx-ink);padding:7px 9px;font:inherit;font-size:12px}
.rsx-textarea{min-height:66px;resize:vertical}
.rsx-input:focus,.rsx-textarea:focus{outline:2px solid var(--rsx-accent-soft);border-color:var(--rsx-accent)}
.rsx-prompt{background:var(--rsx-sunken);border:1px solid var(--rsx-line);border-radius:9px;padding:11px;font-size:12px;white-space:pre-wrap;max-height:260px;overflow:auto;line-height:1.6}
.rsx-toast{position:fixed;right:18px;bottom:18px;z-index:60;background:var(--rsx-ink);color:var(--rsx-bg);border-radius:9px;padding:8px 12px;font-size:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);max-width:min(420px,80vw)}
.rsx-toast.bad{background:var(--rsx-bad);color:#fff}
.rsx-error{background:var(--rsx-bad-soft);border:1px solid var(--rsx-bad);color:var(--rsx-bad);border-radius:9px;padding:9px 11px;font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.rsx-loading{padding:40px;text-align:center;color:var(--rsx-muted);font-size:12px}
.rsx-sep{height:1px;background:var(--rsx-line);margin:2px 0}
.rsx-note{font-size:11px;color:var(--rsx-muted)}
.rsx-actions{display:flex;gap:8px;flex-wrap:wrap}
.rsx-link{color:var(--rsx-accent);text-decoration:none;cursor:pointer;background:none;border:0;padding:0;font:inherit}
.rsx-link:hover{text-decoration:underline}
.rsx-stage-banner{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:11px;background:var(--rsx-accent-soft);border:1px solid var(--rsx-accent)}
.rsx-stage-banner.bad{background:var(--rsx-bad-soft);border-color:var(--rsx-bad)}
.rsx-stage-banner .rsx-stage-name{font-size:16px;font-weight:700}
.rsx-stage-banner .rsx-stage-sub{font-size:11.5px;color:var(--rsx-muted)}
.rsx-project-head{display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;padding:2px 2px 0}
.rsx-project-head .rsx-h1{font-size:20px}
.rsx-project-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:7px}
.rsx-flywheel{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr);background:var(--rsx-surface);border:1px solid var(--rsx-line);border-radius:16px;box-shadow:var(--rsx-shadow);overflow:hidden}
.rsx-fly-visual{position:relative;display:flex;align-items:center;justify-content:center;min-height:360px;padding:18px;background:radial-gradient(circle at 50% 50%,var(--rsx-accent-soft),transparent 68%),var(--rsx-bg);border-right:1px solid var(--rsx-line)}
.rsx-fly-visual svg{width:100%;max-width:330px;height:auto;display:block}
.rsx-fly-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:112px;height:112px;border-radius:50%;background:var(--rsx-surface);border:1px solid var(--rsx-line);box-shadow:var(--rsx-shadow);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none;gap:1px}
.rsx-fly-round{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--rsx-faint)}
.rsx-fly-center b{font-size:17px;line-height:1.15;letter-spacing:-.02em}
.rsx-fly-done{font-size:11px;font-weight:700;color:var(--rsx-accent);line-height:1.2}
.rsx-fly-done-label{font-size:9px;color:var(--rsx-muted)}
.rsx-fly-label{fill:var(--rsx-muted);font-size:9.5px;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-weight:550;letter-spacing:.02em}
.rsx-fly-label.current{fill:var(--rsx-accent);font-weight:750}
.rsx-fly-main{padding:18px 20px;display:flex;flex-direction:column;gap:11px;min-width:0}
.rsx-eyebrow{font-size:9.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--rsx-faint)}
.rsx-fly-headline{display:flex;flex-direction:column;gap:4px}
.rsx-fly-current{font-size:17px;font-weight:700;display:block;letter-spacing:-.01em}
.rsx-fly-gate-line{font-size:11.5px;color:var(--rsx-muted);overflow-wrap:anywhere}
.rsx-fly-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.rsx-fly-kpi{background:var(--rsx-sunken);border-radius:8px;padding:6px 8px;min-width:0}
.rsx-fly-kpi b{display:block;font-size:15px;font-weight:680;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rsx-fly-kpi span{font-size:9.5px;color:var(--rsx-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.rsx-fly-pause{display:flex;gap:8px;padding:8px 10px;border:1px solid var(--rsx-warn);background:var(--rsx-warn-soft);border-radius:9px;color:var(--rsx-ink);font-size:11px;align-items:flex-start}
.rsx-fly-pause-ico{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--rsx-surface);color:var(--rsx-warn);flex:none;margin-top:1px}
.rsx-next-card{border:1px solid var(--rsx-line);background:var(--rsx-bg);border-left:3px solid var(--rsx-accent);border-radius:9px;padding:10px 11px;display:flex;flex-direction:column;gap:7px}
.rsx-next-card.bad{border-left-color:var(--rsx-bad)}
.rsx-next-card.ready{border-left-color:var(--rsx-ok)}
.rsx-next-title{font-size:13px;font-weight:650;line-height:1.4;overflow-wrap:anywhere}
.rsx-next-code{display:block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;line-height:1.55;background:var(--rsx-sunken);border:1px solid var(--rsx-line);padding:4px 6px;border-radius:4px;color:var(--rsx-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.rsx-fly-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px dashed var(--rsx-line);padding-top:8px;font-size:11px;color:var(--rsx-muted)}
.rsx-fly-actions-wrap{display:flex;flex-direction:column;gap:6px;border-top:1px dashed var(--rsx-line);padding-top:9px}
.rsx-fly-actions-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.rsx-fly-actions{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.rsx-fly-action{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:0;padding:7px 6px;border:1px solid var(--rsx-line);border-radius:7px;background:var(--rsx-surface);color:var(--rsx-ink);font-size:11px;font-weight:600;line-height:1.2;font-family:inherit;white-space:nowrap;cursor:pointer}
.rsx-fly-action span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.rsx-fly-action:hover:not(:disabled){border-color:var(--rsx-accent);background:var(--rsx-accent-soft);color:var(--rsx-accent)}
.rsx-fly-action:active:not(:disabled){transform:translateY(1px)}
.rsx-fly-action.primary{border-color:var(--rsx-accent);background:var(--rsx-accent);color:#fff}
.rsx-fly-action.primary:hover:not(:disabled){filter:brightness(.96);background:var(--rsx-accent);color:#fff}
.rsx-fly-action:focus-visible{outline:2px solid var(--rsx-accent);outline-offset:2px}
.rsx-fly-action:disabled{opacity:.42;cursor:not-allowed;background:var(--rsx-sunken);border-color:var(--rsx-line);color:var(--rsx-muted);box-shadow:none;transform:none}
.rsx-action-hint{font-size:10px;line-height:1.45;color:var(--rsx-muted);overflow-wrap:anywhere}
.rsx-trail{display:flex;flex-direction:column}
.rsx-trail-row{display:flex;gap:9px;padding:9px 0;border-bottom:1px dashed var(--rsx-line)}
.rsx-trail-row:first-child{padding-top:0}
.rsx-trail-row:last-child{border-bottom:0;padding-bottom:0}
.rsx-trail-dot{width:8px;height:8px;border-radius:50%;background:var(--rsx-muted);margin-top:5px;flex:none;box-shadow:0 0 0 3px var(--rsx-sunken)}
.rsx-trail-dot.ok{background:var(--rsx-ok)}
.rsx-trail-dot.bad{background:var(--rsx-bad)}
.rsx-trail-dot.warn{background:var(--rsx-warn)}
.rsx-trail-main{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px}
.rsx-trail-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.rsx-trail-title code{font-size:10px;font-weight:700;color:var(--rsx-ink);background:var(--rsx-sunken);padding:1px 5px;border-radius:4px}
.rsx-trail-goal{font-size:12px;font-weight:600;line-height:1.4;overflow-wrap:anywhere}
.rsx-trail-obs{font-size:11px;color:var(--rsx-muted);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.rsx-trail-empty{display:flex;gap:9px;align-items:flex-start;padding:12px;background:var(--rsx-sunken);border-radius:9px;color:var(--rsx-muted);font-size:11.5px}
.rsx-trail-empty b{color:var(--rsx-ink);display:block;margin-bottom:2px}
@media (max-width:980px){.rsx-flywheel{grid-template-columns:1fr}.rsx-fly-visual{border-right:0;border-bottom:1px solid var(--rsx-line);min-height:310px;padding:10px}.rsx-fly-visual svg{max-width:300px}.rsx-fly-main{padding:14px 16px 16px}}
@media (max-width:700px){.rsx-fly-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.rsx-project-head .rsx-h1{font-size:18px}.rsx-fly-visual{min-height:280px}.rsx-fly-visual svg{max-width:270px}.rsx-fly-center{width:96px;height:96px}.rsx-fly-center b{font-size:15px}.rsx-fly-foot{gap:7px}.rsx-fly-actions{grid-template-columns:repeat(3,minmax(0,1fr))}}
`

    let styleInjected = false
    function ensureStyles() {
      if (styleInjected || typeof document === "undefined") return
      styleInjected = true
      try {
        const tag = document.createElement("style")
        tag.id = "dsh-research-suite-style"
        tag.textContent = CSS
        document.head.appendChild(tag)
      } catch {
        styleInjected = false
      }
    }
