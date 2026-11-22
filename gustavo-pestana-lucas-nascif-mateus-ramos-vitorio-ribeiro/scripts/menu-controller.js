export const MENU_OPTIONS=['INICIAR VIGÍLIA','CONTROLES','CRÉDITOS'];
export class MenuController {
  constructor(){this.selection=0;this.page='root';}
  hit(x,y){
    if(this.page!=='root')return x>=78&&x<=560&&y>=616&&y<=657?'back':null;
    if(x<78||x>580)return null;
    return MENU_OPTIONS.findIndex((_,i)=>y>=400+i*52&&y<448+i*52);
  }
  hover(x,y){const i=this.hit(x,y);if(Number.isInteger(i)&&i>=0)this.selection=i;}
  update({up=false,down=false,confirm=false,back=false,click=null}={}){
    if(this.page!=='root'){
      if(back||confirm||click==='back')this.page='root';
      return false;
    }
    if(up)this.selection=(this.selection+MENU_OPTIONS.length-1)%MENU_OPTIONS.length;
    if(down)this.selection=(this.selection+1)%MENU_OPTIONS.length;
    if(Number.isInteger(click)&&click>=0)this.selection=click;
    if(!confirm&&!(Number.isInteger(click)&&click>=0))return false;
    if(this.selection===0)return true;
    this.page=this.selection===1?'controls':'credits';
    return false;
  }
}
