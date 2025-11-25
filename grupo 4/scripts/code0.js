gdjs.IntroCode = {};
gdjs.IntroCode.localVariables = [];
gdjs.IntroCode.idToCallbackMap = new Map();
gdjs.IntroCode.GDScoreTextObjects1= [];
gdjs.IntroCode.GDScoreTextObjects2= [];
gdjs.IntroCode.GDScoreTextObjects3= [];
gdjs.IntroCode.GDSignObjects1= [];
gdjs.IntroCode.GDSignObjects2= [];
gdjs.IntroCode.GDSignObjects3= [];
gdjs.IntroCode.GDSignArrowObjects1= [];
gdjs.IntroCode.GDSignArrowObjects2= [];
gdjs.IntroCode.GDSignArrowObjects3= [];
gdjs.IntroCode.GDPlatformRightObjects1= [];
gdjs.IntroCode.GDPlatformRightObjects2= [];
gdjs.IntroCode.GDPlatformRightObjects3= [];
gdjs.IntroCode.GDPlatformMiddleObjects1= [];
gdjs.IntroCode.GDPlatformMiddleObjects2= [];
gdjs.IntroCode.GDPlatformMiddleObjects3= [];
gdjs.IntroCode.GDPlatformLeftObjects1= [];
gdjs.IntroCode.GDPlatformLeftObjects2= [];
gdjs.IntroCode.GDPlatformLeftObjects3= [];
gdjs.IntroCode.GDIslandObjects1= [];
gdjs.IntroCode.GDIslandObjects2= [];
gdjs.IntroCode.GDIslandObjects3= [];
gdjs.IntroCode.GDSkeletonObjects1= [];
gdjs.IntroCode.GDSkeletonObjects2= [];
gdjs.IntroCode.GDSkeletonObjects3= [];
gdjs.IntroCode.GDGrass2Objects1= [];
gdjs.IntroCode.GDGrass2Objects2= [];
gdjs.IntroCode.GDGrass2Objects3= [];
gdjs.IntroCode.GDCactus3Objects1= [];
gdjs.IntroCode.GDCactus3Objects2= [];
gdjs.IntroCode.GDCactus3Objects3= [];
gdjs.IntroCode.GDCactus2Objects1= [];
gdjs.IntroCode.GDCactus2Objects2= [];
gdjs.IntroCode.GDCactus2Objects3= [];
gdjs.IntroCode.GDTreeObjects1= [];
gdjs.IntroCode.GDTreeObjects2= [];
gdjs.IntroCode.GDTreeObjects3= [];
gdjs.IntroCode.GDTitleObjects1= [];
gdjs.IntroCode.GDTitleObjects2= [];
gdjs.IntroCode.GDTitleObjects3= [];
gdjs.IntroCode.GDStartTextObjects1= [];
gdjs.IntroCode.GDStartTextObjects2= [];
gdjs.IntroCode.GDStartTextObjects3= [];
gdjs.IntroCode.GDLittleSignArrowObjects1= [];
gdjs.IntroCode.GDLittleSignArrowObjects2= [];
gdjs.IntroCode.GDLittleSignArrowObjects3= [];
gdjs.IntroCode.GDPlatformObjects1= [];
gdjs.IntroCode.GDPlatformObjects2= [];
gdjs.IntroCode.GDPlatformObjects3= [];
gdjs.IntroCode.GDBackgroundObjects1= [];
gdjs.IntroCode.GDBackgroundObjects2= [];
gdjs.IntroCode.GDBackgroundObjects3= [];
gdjs.IntroCode.GDDustParticlesObjects1= [];
gdjs.IntroCode.GDDustParticlesObjects2= [];
gdjs.IntroCode.GDDustParticlesObjects3= [];
gdjs.IntroCode.GDMeteorObjects1= [];
gdjs.IntroCode.GDMeteorObjects2= [];
gdjs.IntroCode.GDMeteorObjects3= [];
gdjs.IntroCode.GDLivesTextObjects1= [];
gdjs.IntroCode.GDLivesTextObjects2= [];
gdjs.IntroCode.GDLivesTextObjects3= [];
gdjs.IntroCode.GDbroken_9595heartObjects1= [];
gdjs.IntroCode.GDbroken_9595heartObjects2= [];
gdjs.IntroCode.GDbroken_9595heartObjects3= [];
gdjs.IntroCode.GDBonusObjectObjects1= [];
gdjs.IntroCode.GDBonusObjectObjects2= [];
gdjs.IntroCode.GDBonusObjectObjects3= [];


gdjs.IntroCode.eventsList0 = function(runtimeScene) {

{

gdjs.copyArray(runtimeScene.getObjects("SignArrow"), gdjs.IntroCode.GDSignArrowObjects2);

let isConditionTrue_0 = false;
isConditionTrue_0 = false;
for (var i = 0, k = 0, l = gdjs.IntroCode.GDSignArrowObjects2.length;i<l;++i) {
    if ( gdjs.IntroCode.GDSignArrowObjects2[i].getBehavior("ButtonFSM").IsClicked(null) ) {
        isConditionTrue_0 = true;
        gdjs.IntroCode.GDSignArrowObjects2[k] = gdjs.IntroCode.GDSignArrowObjects2[i];
        ++k;
    }
}
gdjs.IntroCode.GDSignArrowObjects2.length = k;
if (isConditionTrue_0) {
{gdjs.evtTools.runtimeScene.replaceScene(runtimeScene, "Game", false);
}
}

}


{



}


{

gdjs.copyArray(runtimeScene.getObjects("Sign"), gdjs.IntroCode.GDSignObjects1);

let isConditionTrue_0 = false;
isConditionTrue_0 = false;
for (var i = 0, k = 0, l = gdjs.IntroCode.GDSignObjects1.length;i<l;++i) {
    if ( gdjs.IntroCode.GDSignObjects1[i].getBehavior("ButtonFSM").IsClicked(null) ) {
        isConditionTrue_0 = true;
        gdjs.IntroCode.GDSignObjects1[k] = gdjs.IntroCode.GDSignObjects1[i];
        ++k;
    }
}
gdjs.IntroCode.GDSignObjects1.length = k;
if (isConditionTrue_0) {
{gdjs.evtTools.leaderboards.displayLeaderboard(runtimeScene, "2dfc4fba-1e2b-4e07-b3f3-3ee9839ab0dd", true);
}
{gdjs.evtTools.runtimeScene.pushScene(runtimeScene, "LeaderboardBackground");
}
}

}


};gdjs.IntroCode.eventsList1 = function(runtimeScene) {

{

gdjs.copyArray(runtimeScene.getObjects("SignArrow"), gdjs.IntroCode.GDSignArrowObjects2);

let isConditionTrue_0 = false;
isConditionTrue_0 = false;
for (var i = 0, k = 0, l = gdjs.IntroCode.GDSignArrowObjects2.length;i<l;++i) {
    if ( gdjs.IntroCode.GDSignArrowObjects2[i].getBehavior("ButtonFSM").IsHovered(null) ) {
        isConditionTrue_0 = true;
        gdjs.IntroCode.GDSignArrowObjects2[k] = gdjs.IntroCode.GDSignArrowObjects2[i];
        ++k;
    }
}
gdjs.IntroCode.GDSignArrowObjects2.length = k;
if (isConditionTrue_0) {
gdjs.copyArray(runtimeScene.getObjects("StartText"), gdjs.IntroCode.GDStartTextObjects2);
{for(var i = 0, len = gdjs.IntroCode.GDStartTextObjects2.length ;i < len;++i) {
    gdjs.IntroCode.GDStartTextObjects2[i].getBehavior("Effect").enableEffect("Hovering", true);
}
}
}

}


{

gdjs.copyArray(runtimeScene.getObjects("SignArrow"), gdjs.IntroCode.GDSignArrowObjects2);

let isConditionTrue_0 = false;
isConditionTrue_0 = false;
for (var i = 0, k = 0, l = gdjs.IntroCode.GDSignArrowObjects2.length;i<l;++i) {
    if ( !(gdjs.IntroCode.GDSignArrowObjects2[i].getBehavior("ButtonFSM").IsHovered(null)) ) {
        isConditionTrue_0 = true;
        gdjs.IntroCode.GDSignArrowObjects2[k] = gdjs.IntroCode.GDSignArrowObjects2[i];
        ++k;
    }
}
gdjs.IntroCode.GDSignArrowObjects2.length = k;
if (isConditionTrue_0) {
gdjs.copyArray(runtimeScene.getObjects("StartText"), gdjs.IntroCode.GDStartTextObjects2);
{for(var i = 0, len = gdjs.IntroCode.GDStartTextObjects2.length ;i < len;++i) {
    gdjs.IntroCode.GDStartTextObjects2[i].getBehavior("Effect").enableEffect("Hovering", false);
}
}
}

}


{

gdjs.copyArray(runtimeScene.getObjects("Sign"), gdjs.IntroCode.GDSignObjects2);

let isConditionTrue_0 = false;
isConditionTrue_0 = false;
for (var i = 0, k = 0, l = gdjs.IntroCode.GDSignObjects2.length;i<l;++i) {
    if ( gdjs.IntroCode.GDSignObjects2[i].getBehavior("ButtonFSM").IsHovered(null) ) {
        isConditionTrue_0 = true;
        gdjs.IntroCode.GDSignObjects2[k] = gdjs.IntroCode.GDSignObjects2[i];
        ++k;
    }
}
gdjs.IntroCode.GDSignObjects2.length = k;
if (isConditionTrue_0) {
gdjs.copyArray(runtimeScene.getObjects("ScoreText"), gdjs.IntroCode.GDScoreTextObjects2);
{for(var i = 0, len = gdjs.IntroCode.GDScoreTextObjects2.length ;i < len;++i) {
    gdjs.IntroCode.GDScoreTextObjects2[i].getBehavior("Effect").enableEffect("Hovering", true);
}
}
}

}


{

gdjs.copyArray(runtimeScene.getObjects("Sign"), gdjs.IntroCode.GDSignObjects1);

let isConditionTrue_0 = false;
isConditionTrue_0 = false;
for (var i = 0, k = 0, l = gdjs.IntroCode.GDSignObjects1.length;i<l;++i) {
    if ( !(gdjs.IntroCode.GDSignObjects1[i].getBehavior("ButtonFSM").IsHovered(null)) ) {
        isConditionTrue_0 = true;
        gdjs.IntroCode.GDSignObjects1[k] = gdjs.IntroCode.GDSignObjects1[i];
        ++k;
    }
}
gdjs.IntroCode.GDSignObjects1.length = k;
if (isConditionTrue_0) {
gdjs.copyArray(runtimeScene.getObjects("ScoreText"), gdjs.IntroCode.GDScoreTextObjects1);
{for(var i = 0, len = gdjs.IntroCode.GDScoreTextObjects1.length ;i < len;++i) {
    gdjs.IntroCode.GDScoreTextObjects1[i].getBehavior("Effect").enableEffect("Hovering", false);
}
}
}

}


};gdjs.IntroCode.eventsList2 = function(runtimeScene) {

{


let isConditionTrue_0 = false;
isConditionTrue_0 = false;
isConditionTrue_0 = gdjs.evtTools.runtimeScene.sceneJustBegins(runtimeScene);
if (isConditionTrue_0) {
gdjs.copyArray(runtimeScene.getObjects("ScoreText"), gdjs.IntroCode.GDScoreTextObjects1);
{for(var i = 0, len = gdjs.IntroCode.GDScoreTextObjects1.length ;i < len;++i) {
    gdjs.IntroCode.GDScoreTextObjects1[i].setTextAlignment("center");
}
}
{gdjs.evtTools.sound.playMusic(runtimeScene, "LeaderboardMusic.mp3", true, 30, 1);
}
}

}


{


gdjs.IntroCode.eventsList0(runtimeScene);
}


{


gdjs.IntroCode.eventsList1(runtimeScene);
}


};

gdjs.IntroCode.func = function(runtimeScene) {
runtimeScene.getOnceTriggers().startNewFrame();

gdjs.IntroCode.GDScoreTextObjects1.length = 0;
gdjs.IntroCode.GDScoreTextObjects2.length = 0;
gdjs.IntroCode.GDScoreTextObjects3.length = 0;
gdjs.IntroCode.GDSignObjects1.length = 0;
gdjs.IntroCode.GDSignObjects2.length = 0;
gdjs.IntroCode.GDSignObjects3.length = 0;
gdjs.IntroCode.GDSignArrowObjects1.length = 0;
gdjs.IntroCode.GDSignArrowObjects2.length = 0;
gdjs.IntroCode.GDSignArrowObjects3.length = 0;
gdjs.IntroCode.GDPlatformRightObjects1.length = 0;
gdjs.IntroCode.GDPlatformRightObjects2.length = 0;
gdjs.IntroCode.GDPlatformRightObjects3.length = 0;
gdjs.IntroCode.GDPlatformMiddleObjects1.length = 0;
gdjs.IntroCode.GDPlatformMiddleObjects2.length = 0;
gdjs.IntroCode.GDPlatformMiddleObjects3.length = 0;
gdjs.IntroCode.GDPlatformLeftObjects1.length = 0;
gdjs.IntroCode.GDPlatformLeftObjects2.length = 0;
gdjs.IntroCode.GDPlatformLeftObjects3.length = 0;
gdjs.IntroCode.GDIslandObjects1.length = 0;
gdjs.IntroCode.GDIslandObjects2.length = 0;
gdjs.IntroCode.GDIslandObjects3.length = 0;
gdjs.IntroCode.GDSkeletonObjects1.length = 0;
gdjs.IntroCode.GDSkeletonObjects2.length = 0;
gdjs.IntroCode.GDSkeletonObjects3.length = 0;
gdjs.IntroCode.GDGrass2Objects1.length = 0;
gdjs.IntroCode.GDGrass2Objects2.length = 0;
gdjs.IntroCode.GDGrass2Objects3.length = 0;
gdjs.IntroCode.GDCactus3Objects1.length = 0;
gdjs.IntroCode.GDCactus3Objects2.length = 0;
gdjs.IntroCode.GDCactus3Objects3.length = 0;
gdjs.IntroCode.GDCactus2Objects1.length = 0;
gdjs.IntroCode.GDCactus2Objects2.length = 0;
gdjs.IntroCode.GDCactus2Objects3.length = 0;
gdjs.IntroCode.GDTreeObjects1.length = 0;
gdjs.IntroCode.GDTreeObjects2.length = 0;
gdjs.IntroCode.GDTreeObjects3.length = 0;
gdjs.IntroCode.GDTitleObjects1.length = 0;
gdjs.IntroCode.GDTitleObjects2.length = 0;
gdjs.IntroCode.GDTitleObjects3.length = 0;
gdjs.IntroCode.GDStartTextObjects1.length = 0;
gdjs.IntroCode.GDStartTextObjects2.length = 0;
gdjs.IntroCode.GDStartTextObjects3.length = 0;
gdjs.IntroCode.GDLittleSignArrowObjects1.length = 0;
gdjs.IntroCode.GDLittleSignArrowObjects2.length = 0;
gdjs.IntroCode.GDLittleSignArrowObjects3.length = 0;
gdjs.IntroCode.GDPlatformObjects1.length = 0;
gdjs.IntroCode.GDPlatformObjects2.length = 0;
gdjs.IntroCode.GDPlatformObjects3.length = 0;
gdjs.IntroCode.GDBackgroundObjects1.length = 0;
gdjs.IntroCode.GDBackgroundObjects2.length = 0;
gdjs.IntroCode.GDBackgroundObjects3.length = 0;
gdjs.IntroCode.GDDustParticlesObjects1.length = 0;
gdjs.IntroCode.GDDustParticlesObjects2.length = 0;
gdjs.IntroCode.GDDustParticlesObjects3.length = 0;
gdjs.IntroCode.GDMeteorObjects1.length = 0;
gdjs.IntroCode.GDMeteorObjects2.length = 0;
gdjs.IntroCode.GDMeteorObjects3.length = 0;
gdjs.IntroCode.GDLivesTextObjects1.length = 0;
gdjs.IntroCode.GDLivesTextObjects2.length = 0;
gdjs.IntroCode.GDLivesTextObjects3.length = 0;
gdjs.IntroCode.GDbroken_9595heartObjects1.length = 0;
gdjs.IntroCode.GDbroken_9595heartObjects2.length = 0;
gdjs.IntroCode.GDbroken_9595heartObjects3.length = 0;
gdjs.IntroCode.GDBonusObjectObjects1.length = 0;
gdjs.IntroCode.GDBonusObjectObjects2.length = 0;
gdjs.IntroCode.GDBonusObjectObjects3.length = 0;

gdjs.IntroCode.eventsList2(runtimeScene);
gdjs.IntroCode.GDScoreTextObjects1.length = 0;
gdjs.IntroCode.GDScoreTextObjects2.length = 0;
gdjs.IntroCode.GDScoreTextObjects3.length = 0;
gdjs.IntroCode.GDSignObjects1.length = 0;
gdjs.IntroCode.GDSignObjects2.length = 0;
gdjs.IntroCode.GDSignObjects3.length = 0;
gdjs.IntroCode.GDSignArrowObjects1.length = 0;
gdjs.IntroCode.GDSignArrowObjects2.length = 0;
gdjs.IntroCode.GDSignArrowObjects3.length = 0;
gdjs.IntroCode.GDPlatformRightObjects1.length = 0;
gdjs.IntroCode.GDPlatformRightObjects2.length = 0;
gdjs.IntroCode.GDPlatformRightObjects3.length = 0;
gdjs.IntroCode.GDPlatformMiddleObjects1.length = 0;
gdjs.IntroCode.GDPlatformMiddleObjects2.length = 0;
gdjs.IntroCode.GDPlatformMiddleObjects3.length = 0;
gdjs.IntroCode.GDPlatformLeftObjects1.length = 0;
gdjs.IntroCode.GDPlatformLeftObjects2.length = 0;
gdjs.IntroCode.GDPlatformLeftObjects3.length = 0;
gdjs.IntroCode.GDIslandObjects1.length = 0;
gdjs.IntroCode.GDIslandObjects2.length = 0;
gdjs.IntroCode.GDIslandObjects3.length = 0;
gdjs.IntroCode.GDSkeletonObjects1.length = 0;
gdjs.IntroCode.GDSkeletonObjects2.length = 0;
gdjs.IntroCode.GDSkeletonObjects3.length = 0;
gdjs.IntroCode.GDGrass2Objects1.length = 0;
gdjs.IntroCode.GDGrass2Objects2.length = 0;
gdjs.IntroCode.GDGrass2Objects3.length = 0;
gdjs.IntroCode.GDCactus3Objects1.length = 0;
gdjs.IntroCode.GDCactus3Objects2.length = 0;
gdjs.IntroCode.GDCactus3Objects3.length = 0;
gdjs.IntroCode.GDCactus2Objects1.length = 0;
gdjs.IntroCode.GDCactus2Objects2.length = 0;
gdjs.IntroCode.GDCactus2Objects3.length = 0;
gdjs.IntroCode.GDTreeObjects1.length = 0;
gdjs.IntroCode.GDTreeObjects2.length = 0;
gdjs.IntroCode.GDTreeObjects3.length = 0;
gdjs.IntroCode.GDTitleObjects1.length = 0;
gdjs.IntroCode.GDTitleObjects2.length = 0;
gdjs.IntroCode.GDTitleObjects3.length = 0;
gdjs.IntroCode.GDStartTextObjects1.length = 0;
gdjs.IntroCode.GDStartTextObjects2.length = 0;
gdjs.IntroCode.GDStartTextObjects3.length = 0;
gdjs.IntroCode.GDLittleSignArrowObjects1.length = 0;
gdjs.IntroCode.GDLittleSignArrowObjects2.length = 0;
gdjs.IntroCode.GDLittleSignArrowObjects3.length = 0;
gdjs.IntroCode.GDPlatformObjects1.length = 0;
gdjs.IntroCode.GDPlatformObjects2.length = 0;
gdjs.IntroCode.GDPlatformObjects3.length = 0;
gdjs.IntroCode.GDBackgroundObjects1.length = 0;
gdjs.IntroCode.GDBackgroundObjects2.length = 0;
gdjs.IntroCode.GDBackgroundObjects3.length = 0;
gdjs.IntroCode.GDDustParticlesObjects1.length = 0;
gdjs.IntroCode.GDDustParticlesObjects2.length = 0;
gdjs.IntroCode.GDDustParticlesObjects3.length = 0;
gdjs.IntroCode.GDMeteorObjects1.length = 0;
gdjs.IntroCode.GDMeteorObjects2.length = 0;
gdjs.IntroCode.GDMeteorObjects3.length = 0;
gdjs.IntroCode.GDLivesTextObjects1.length = 0;
gdjs.IntroCode.GDLivesTextObjects2.length = 0;
gdjs.IntroCode.GDLivesTextObjects3.length = 0;
gdjs.IntroCode.GDbroken_9595heartObjects1.length = 0;
gdjs.IntroCode.GDbroken_9595heartObjects2.length = 0;
gdjs.IntroCode.GDbroken_9595heartObjects3.length = 0;
gdjs.IntroCode.GDBonusObjectObjects1.length = 0;
gdjs.IntroCode.GDBonusObjectObjects2.length = 0;
gdjs.IntroCode.GDBonusObjectObjects3.length = 0;


return;

}

gdjs['IntroCode'] = gdjs.IntroCode;
