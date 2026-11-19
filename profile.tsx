import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../src/constants/theme';
export default function Profile() {
 return <ScrollView style={s.page} contentContainerStyle={s.content}>
  <View style={s.top}><Ionicons name="settings-outline" color={theme.text} size={23}/></View>
  <View style={s.center}><View style={s.avatar}><Text style={s.initial}>M</Text></View><Text style={s.name}>Meetapp User <Text style={{color:theme.cyan}}>✓</Text></Text><Text style={s.handle}>@your_username</Text><Text style={s.bio}>Your bio will appear here.</Text><Text style={s.link}>↗ Add your website</Text></View>
  <View style={s.stats}><View><Text style={s.num}>0</Text><Text style={s.muted}>Following</Text></View><View><Text style={s.num}>0</Text><Text style={s.muted}>Followers</Text></View><View><Text style={s.num}>0</Text><Text style={s.muted}>Likes</Text></View></View>
  <View style={s.buttons}><Text style={s.button}>＋ Follow</Text><Text style={s.button}>Message</Text></View>
  <Text style={s.heading}>Posts</Text><View style={s.grid}>{[1,2,3].map(n=><View key={n} style={s.tile}><Ionicons name="play" color={theme.muted} size={20}/></View>)}</View>
  <Text style={s.muted}>Profile gallery · 3 media slots</Text>
 </ScrollView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:theme.bg},content:{padding:20,paddingTop:56,gap:18},top:{alignItems:'flex-end'},center:{alignItems:'center',gap:7},avatar:{width:88,height:88,borderRadius:44,backgroundColor:theme.panel2,borderWidth:2,borderColor:theme.cyan,alignItems:'center',justifyContent:'center'},initial:{color:theme.text,fontSize:34,fontWeight:'900'},name:{color:theme.text,fontSize:20,fontWeight:'900'},handle:{color:theme.muted},bio:{color:theme.text,textAlign:'center'},link:{color:theme.cyan},stats:{flexDirection:'row',justifyContent:'space-around',paddingVertical:12},num:{color:theme.text,fontSize:20,fontWeight:'900',textAlign:'center'},muted:{color:theme.muted,textAlign:'center'},buttons:{flexDirection:'row',gap:10},button:{flex:1,textAlign:'center',overflow:'hidden',color:'#fff',backgroundColor:theme.accent,padding:13,borderRadius:12,fontWeight:'800'},heading:{color:theme.text,fontSize:18,fontWeight:'800'},grid:{flexDirection:'row',gap:8},tile:{flex:1,height:112,borderRadius:12,backgroundColor:theme.panel2,alignItems:'center',justifyContent:'center'}});
