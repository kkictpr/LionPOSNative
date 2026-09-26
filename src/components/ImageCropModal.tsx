
import React from 'react';
import {Modal,View,Text,Pressable,StyleSheet} from 'react-native';
import {Gesture,GestureDetector} from 'react-native-gesture-handler';
import Animated,{useSharedValue,useAnimatedStyle} from 'react-native-reanimated';

type Props={visible:boolean;imageUri:string|null;onCancel:()=>void;onDone:(uri:string)=>void};

export default function ImageCropModal({visible,imageUri,onCancel,onDone}:Props){
  const x=useSharedValue(0), y=useSharedValue(0), size=useSharedValue(220);
  const move=Gesture.Pan().onUpdate(e=>{x.value=e.translationX;y.value=e.translationY;});
  const br=Gesture.Pan().onUpdate(e=>{size.value=Math.max(140,Math.min(320,220+Math.max(e.translationX,e.translationY)));});
  const tl=Gesture.Pan().onUpdate(e=>{
    const d=Math.max(e.translationX,e.translationY);
    size.value=Math.max(140,220-d); x.value=d; y.value=d;
  });
  const box=useAnimatedStyle(()=>({transform:[{translateX:x.value},{translateY:y.value}],width:size.value,height:size.value}));
  return <Modal visible={visible} transparent animationType="fade">
    <View style={s.bg}><View style={s.card}>
      <Text style={s.title}>ครอบตัดรูปภาพ (1:1)</Text>
      <View style={s.stage}>
        <GestureDetector gesture={move}>
          <Animated.View style={[s.square,box]}>
            <View style={s.v1}/><View style={s.v2}/><View style={s.h1}/><View style={s.h2}/>
            <GestureDetector gesture={tl}><Animated.View style={[s.handle,s.tl]}/></GestureDetector>
            <GestureDetector gesture={br}><Animated.View style={[s.handle,s.br]}/></GestureDetector>
            <View style={[s.handle,s.tr]}/><View style={[s.handle,s.bl]}/>
          </Animated.View>
        </GestureDetector>
      </View>
      <View style={s.row}>
        <Pressable onPress={onCancel}><Text style={s.btn}>ยกเลิก</Text></Pressable>
        <Pressable onPress={()=>imageUri&&onDone(imageUri)}><Text style={s.btn}>ใช้รูปนี้</Text></Pressable>
      </View>
    </View></View></Modal>;
}
const s=StyleSheet.create({
 bg:{flex:1,backgroundColor:'rgba(0,0,0,.65)',justifyContent:'center',alignItems:'center'},
 card:{width:'92%',backgroundColor:'#0B1220',borderRadius:22,padding:18},
 title:{color:'#fff',fontSize:18,fontWeight:'700',marginBottom:10},
 stage:{height:360,justifyContent:'center',alignItems:'center'},
 square:{borderWidth:5,borderColor:'#FFFFFF',backgroundColor:'rgba(255,255,255,.02)'},
 v1:{position:'absolute',left:'33.33%',top:0,bottom:0,width:3,backgroundColor:'rgba(255,255,255,1)'},
 v2:{position:'absolute',left:'66.66%',top:0,bottom:0,width:3,backgroundColor:'rgba(255,255,255,1)'},
 h1:{position:'absolute',top:'33.33%',left:0,right:0,height:3,backgroundColor:'rgba(255,255,255,1)'},
 h2:{position:'absolute',top:'66.66%',left:0,right:0,height:3,backgroundColor:'rgba(255,255,255,1)'},
 handle:{position:'absolute',width:28,height:28,borderRadius:14,backgroundColor:'#FFFFFF',borderWidth:3,borderColor:'#F59E0B'},
 tl:{left:-9,top:-9},tr:{right:-9,top:-9},bl:{left:-9,bottom:-9},br:{right:-9,bottom:-9},
 row:{flexDirection:'row',justifyContent:'space-between',marginTop:16},
 btn:{color:'#F59E0B',fontWeight:'700'}
});
