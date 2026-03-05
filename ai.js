
export async function handler(event){
const body = JSON.parse(event.body || "{}")
return {
statusCode:200,
body:JSON.stringify({
text:"Oliver's day looks balanced. Keep wake windows around 2 hours and watch for sleepy cues."
})
}
}
