export const CUT_SPEED=1.6;
const cut=7.28,impact=cut+1.5/CUT_SPEED;
export const ULT_CINE=Object.freeze({turn:1.15,reflect:1.23,crack:2.69,shatterImpact:2.88,break:2.98,repair:4.88,repaired:5.83,reveal:5.93,cut,impact,hit:impact+.12,end:impact+.12,slashY:470});
export const CINEMATIC_STAGES=['silencio','impacto-troca','reflexo','impacto-quebra','fratura','recomposicao','impacto-reparo','reflexo-branco','corte','impacto'];
export function cinematicStage(t){return t<ULT_CINE.turn?'silencio':t<ULT_CINE.reflect?'impacto-troca':t<ULT_CINE.shatterImpact?'reflexo':t<ULT_CINE.break?'impacto-quebra':t<ULT_CINE.repair?'fratura':t<ULT_CINE.repaired?'recomposicao':t<ULT_CINE.reveal?'impacto-reparo':t<ULT_CINE.cut?'reflexo-branco':t<ULT_CINE.impact?'corte':t<ULT_CINE.end?'impacto':'jogo';}
