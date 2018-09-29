<h1>ZergBall</h1>
The inspiration behind this project came from the wish to learn server side web stuff. So I decided to come up with a project to help me learn. The project I came up with was a multiplayer soccer game that allows unlimited number of players (or at least until the server catches on fire) to play at the same time on the same field. I chose NodeJS for the server platform, it uses javascript so it was easier to get into and its also really good for handling a flood of requests going back and forth (players sending in their location, server sending them back everyone else's location). The connections between players are facilitated by socket.io since I needed to minimize latency. I tried AJAX at first but the lag was intolerable (might be that I did something wrong too). The file serving is done by express which made it super easy to set up a simple web server that works well. Also, I left all files "visible" on purpose so that people can explore and see how it works. Files can be accessed by typing their location in the folder structure so server.js file for example is at <a style="text-decoration: line-through;">www.zergball.com/server.js</a> or client.js file at <a style="text-decoration: line-through;">www.zergball.com/www/js/client.js</a>. I chose <a href="https://www.openshift.com/">OpenShift</a> for hosting as they host NodeJS, they have a free plan and its easy to work with.
<br>
<br>
The project was a success as I learned alot in the process. Also, I think the game itself came out pretty quite cool (If I could only get more traffic on it).
<br>
<br>
The finished project can be seen at <a style="text-decoration: line-through;">www.zergball.com</a> or at <a  style="text-decoration: line-through;">http://zergball-rndm.rhcloud.com</a> when the domain expires
<br>
<br>
PS: OpenShift powers it's free tier VMs down after a while so the page might not load at first. Just refresh the page a couple of times if that happens and it should come up.

PS: The OpenShift URL is long dead at this point. The project can now be found at [tuuti.rocks/zergball](https://tuuti.rocks/zergball/)