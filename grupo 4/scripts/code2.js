gdjs.LeaderboardCode = {};
gdjs.LeaderboardCode.localVariables = [];
gdjs.LeaderboardCode.idToCallbackMap = new Map();
gdjs.LeaderboardCode.GDLeaderboardDialogObjects1= [];
gdjs.LeaderboardCode.GDLeaderboardDialogObjects2= [];
gdjs.LeaderboardCode.GDPlatformObjects1= [];
gdjs.LeaderboardCode.GDPlatformObjects2= [];
gdjs.LeaderboardCode.GDBackgroundObjects1= [];
gdjs.LeaderboardCode.GDBackgroundObjects2= [];
gdjs.LeaderboardCode.GDDustParticlesObjects1= [];
gdjs.LeaderboardCode.GDDustParticlesObjects2= [];
gdjs.LeaderboardCode.GDMeteorObjects1= [];
gdjs.LeaderboardCode.GDMeteorObjects2= [];
gdjs.LeaderboardCode.GDLivesTextObjects1= [];
gdjs.LeaderboardCode.GDLivesTextObjects2= [];
gdjs.LeaderboardCode.GDbroken_9595heartObjects1= [];
gdjs.LeaderboardCode.GDbroken_9595heartObjects2= [];
gdjs.LeaderboardCode.GDBonusObjectObjects1= [];
gdjs.LeaderboardCode.GDBonusObjectObjects2= [];


gdjs.LeaderboardCode.eventsList0 = function(runtimeScene) {

{


let isConditionTrue_0 = false;
isConditionTrue_0 = false;
isConditionTrue_0 = gdjs.evtTools.runtimeScene.sceneJustBegins(runtimeScene);
if (isConditionTrue_0) {
gdjs.copyArray(runtimeScene.getObjects("LeaderboardDialog"), gdjs.LeaderboardCode.GDLeaderboardDialogObjects1);
{gdjs.evtTools.sound.playMusic(runtimeScene, "LeaderboardMusic.mp3", true, 70, 1);
}
{for(var i = 0, len = gdjs.LeaderboardCode.GDLeaderboardDialogObjects1.length ;i < len;++i) {
    gdjs.LeaderboardCode.GDLeaderboardDialogObjects1[i].SetScore(runtimeScene.getGame().getVariables().getFromIndex(0).getAsNumber(), null);
}
}
{for(var i = 0, len = gdjs.LeaderboardCode.GDLeaderboardDialogObjects1.length ;i < len;++i) {
    gdjs.LeaderboardCode.GDLeaderboardDialogObjects1[i].SetDefaultPlayerName(runtimeScene.getGame().getVariables().getFromIndex(1).getAsString(), null);
}
}
}

}


{

gdjs.copyArray(runtimeScene.getObjects("LeaderboardDialog"), gdjs.LeaderboardCode.GDLeaderboardDialogObjects1);

let isConditionTrue_0 = false;
isConditionTrue_0 = false;
for (var i = 0, k = 0, l = gdjs.LeaderboardCode.GDLeaderboardDialogObjects1.length;i<l;++i) {
    if ( gdjs.LeaderboardCode.GDLeaderboardDialogObjects1[i].IsRestartClicked(null) ) {
        isConditionTrue_0 = true;
        gdjs.LeaderboardCode.GDLeaderboardDialogObjects1[k] = gdjs.LeaderboardCode.GDLeaderboardDialogObjects1[i];
        ++k;
    }
}
gdjs.LeaderboardCode.GDLeaderboardDialogObjects1.length = k;
if (isConditionTrue_0) {
{gdjs.evtTools.runtimeScene.replaceScene(runtimeScene, "Game", false);
}
}

}


{

gdjs.copyArray(runtimeScene.getObjects("LeaderboardDialog"), gdjs.LeaderboardCode.GDLeaderboardDialogObjects1);

let isConditionTrue_0 = false;
isConditionTrue_0 = false;
for (var i = 0, k = 0, l = gdjs.LeaderboardCode.GDLeaderboardDialogObjects1.length;i<l;++i) {
    if ( gdjs.LeaderboardCode.GDLeaderboardDialogObjects1[i].IsScoreSubmitted(null) ) {
        isConditionTrue_0 = true;
        gdjs.LeaderboardCode.GDLeaderboardDialogObjects1[k] = gdjs.LeaderboardCode.GDLeaderboardDialogObjects1[i];
        ++k;
    }
}
gdjs.LeaderboardCode.GDLeaderboardDialogObjects1.length = k;
if (isConditionTrue_0) {
/* Reuse gdjs.LeaderboardCode.GDLeaderboardDialogObjects1 */
{runtimeScene.getGame().getVariables().getFromIndex(1).setString((( gdjs.LeaderboardCode.GDLeaderboardDialogObjects1.length === 0 ) ? "" :gdjs.LeaderboardCode.GDLeaderboardDialogObjects1[0].PlayerName(null)));
}
{gdjs.evtTools.runtimeScene.replaceScene(runtimeScene, "Game", false);
}
}

}


};

gdjs.LeaderboardCode.func = function(runtimeScene) {
runtimeScene.getOnceTriggers().startNewFrame();

gdjs.LeaderboardCode.GDLeaderboardDialogObjects1.length = 0;
gdjs.LeaderboardCode.GDLeaderboardDialogObjects2.length = 0;
gdjs.LeaderboardCode.GDPlatformObjects1.length = 0;
gdjs.LeaderboardCode.GDPlatformObjects2.length = 0;
gdjs.LeaderboardCode.GDBackgroundObjects1.length = 0;
gdjs.LeaderboardCode.GDBackgroundObjects2.length = 0;
gdjs.LeaderboardCode.GDDustParticlesObjects1.length = 0;
gdjs.LeaderboardCode.GDDustParticlesObjects2.length = 0;
gdjs.LeaderboardCode.GDMeteorObjects1.length = 0;
gdjs.LeaderboardCode.GDMeteorObjects2.length = 0;
gdjs.LeaderboardCode.GDLivesTextObjects1.length = 0;
gdjs.LeaderboardCode.GDLivesTextObjects2.length = 0;
gdjs.LeaderboardCode.GDbroken_9595heartObjects1.length = 0;
gdjs.LeaderboardCode.GDbroken_9595heartObjects2.length = 0;
gdjs.LeaderboardCode.GDBonusObjectObjects1.length = 0;
gdjs.LeaderboardCode.GDBonusObjectObjects2.length = 0;

gdjs.LeaderboardCode.eventsList0(runtimeScene);
gdjs.LeaderboardCode.GDLeaderboardDialogObjects1.length = 0;
gdjs.LeaderboardCode.GDLeaderboardDialogObjects2.length = 0;
gdjs.LeaderboardCode.GDPlatformObjects1.length = 0;
gdjs.LeaderboardCode.GDPlatformObjects2.length = 0;
gdjs.LeaderboardCode.GDBackgroundObjects1.length = 0;
gdjs.LeaderboardCode.GDBackgroundObjects2.length = 0;
gdjs.LeaderboardCode.GDDustParticlesObjects1.length = 0;
gdjs.LeaderboardCode.GDDustParticlesObjects2.length = 0;
gdjs.LeaderboardCode.GDMeteorObjects1.length = 0;
gdjs.LeaderboardCode.GDMeteorObjects2.length = 0;
gdjs.LeaderboardCode.GDLivesTextObjects1.length = 0;
gdjs.LeaderboardCode.GDLivesTextObjects2.length = 0;
gdjs.LeaderboardCode.GDbroken_9595heartObjects1.length = 0;
gdjs.LeaderboardCode.GDbroken_9595heartObjects2.length = 0;
gdjs.LeaderboardCode.GDBonusObjectObjects1.length = 0;
gdjs.LeaderboardCode.GDBonusObjectObjects2.length = 0;


return;

}

gdjs['LeaderboardCode'] = gdjs.LeaderboardCode;
