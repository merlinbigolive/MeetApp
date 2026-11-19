import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { theme } from '../../src/constants/theme';
export default function Home() {
  return <ScrollView style={s.page} contentContainerStyle={s.content}>
    <Text style={s.brand}>Meetapp</Text>
    <Text style={s.sub}>Connect. Chat. Call. Together.</Text>
    <View style={s.hero}><Text style={s.heroTitle}>Your people, one place.</Text><Text style={s.muted}>Chats, calls, stories and communities.</Text></View>
    <Text style={s.heading}>Stories</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {['Your story','Aarav','Maya','Rohan','Sara'].map((x,i)=><View key={x} style={s.story}><View style={[s.ring,{borderColor:i===0?theme.accent:theme.cyan}]}><Text style={s.storyInitial}>{i===0?'+':x[0]}</Text></View><Text style={s.muted}>{x}</Text></View>)}
    </ScrollView>
    <Text style={s.heading}>Your space</Text>
    <View style={s.card}><Text style={s.cardTitle}>Welcome to Meetapp</Text><Text style={s.muted}>Your feed and conversations will appear here when you sign in.</Text></View>
  </ScrollView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:theme.bg},content:{padding:20,paddingTop:60,gap:16},brand:{color:theme.text,fontSize:30,fontWeight:'900'},sub:{color:theme.muted,marginTop:-12},hero:{backgroundColor:theme.panel,borderColor:theme.border,borderWidth:1,borderRadius:22,padding:22,gap:8},heroTitle:{color:theme.text,fontSize:22,fontWeight:'800'},muted:{color:theme.muted},heading:{color:theme.text,fontSize:18,fontWeight:'800',marginTop:8},story:{alignItems:'center',gap:7,marginRight:16},ring:{width:58,height:58,borderRadius:29,borderWidth:2,alignItems:'center',justifyContent:'center',backgroundColor:theme.panel2},storyInitial:{color:theme.text,fontSize:22,fontWeight:'800'},card:{backgroundColor:theme.panel,borderRadius:18,padding:18,gap:8},cardTitle:{color:theme.text,fontSize:16,fontWeight:'700'}});
