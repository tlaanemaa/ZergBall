// Global variables for players
playersList = {}; //List to hold all current players
scoreBoard = {Reds:0, Blues:0}
playerStartX = 450
playerStartY = 282
sideStartOffsetX = 100

// Global variables for ball
ballMass = 1
ballMaxForce = 100
ballVelocityDecay = 0.99
ballTouchDistance = 30
playersList['Ball'] = {UID: 'Ball', side: 'Ball', x: 450, y: 282, xVelocity: 0, yVelocity: 0, Score: 0}
lastPlayerToKick = {name: '', number: '', side: ''}
moveBallTimeHolder = ''
gameOn = true

// Variable to hold match time
matchTime = {min: 0, sec: 20}

// Basic server setup
var express = require('express');
var srv = express()
var http = require('http').Server(srv);
var io = require('socket.io')(http);
var port = process.env.OPENSHIFT_NODEJS_PORT || 8080  

srv.use(express.static(__dirname));

http.listen(port, function(){
  console.log('listening on *:' + port );
});


// Start sending field updates
sendUpdate()

// Start calculating ball movements
MoveBall()

// Start counting match time clock
setInterval(incMatchTime, 1000)
sendMatchTime(false)

// Socket stuff for receiving data
io.on('connection', function(socket){

	// New player registration
	socket.on('askReg', function(data){
		var UID = socket.id
		var counts = teamCounts()
		var pNum = freePlayerNum()
		if(counts.reds > counts.blues) side = "B"; else side = "R"
		if(side == "R") var offst = -sideStartOffsetX; else offst = sideStartOffsetX
		playersList[UID] = {UID: UID, side: side, x: playerStartX+offst, y: playerStartY, xVelocity: 0, yVelocity: 0, name: data.name, number: pNum, Score: 0}
		
		// Tell everyone that someone joined
		var msg = '>> ' + playersList[UID].name + ' (' + playersList[UID].number + ') has joined'
		socket.broadcast.emit('chatUpdate', {name: '', msg: msg, sysmes: 1});
		
		// Send back registration confirmation
		socket.emit('getReg', {player: playersList[UID], score: scoreBoard})
		
		// Send a welcome message to the player
		if(side == "B") var msgside = "blue"; else var msgside = "red"
		msg = 'Welcome to the game ' + playersList[UID].name + '. You are on the ' + msgside + ' team and your player number is ' + pNum + '.'
		socket.emit('chatUpdate', {name: '', msg: msg, sysmes: 3})
		
		// Send current match time to player
		sendMatchTime(socket);
		
		// Trigger player scoreboard update on all players
		trigPlayerScoreboardUpdate();
	});
	
	// Player sent its position
	socket.on('sendPos', function(data){
		if(typeof data.UID === 'undefined') return
		if(typeof playersList[data.UID] === 'undefined') return
		var plyrScr = playersList[data.UID].Score
		playersList[data.UID] = data
		playersList[data.UID].Score = plyrScr
	});
	
	// Player left. Tell everyone that he left and delete entry from playersList
	socket.on('disconnect', function(){
		var elem = playersList[socket.id]
		if(typeof elem !== 'undefined') {
			var msg = '>> ' + elem.name + ' (' + elem.number + ') has left'
			io.sockets.emit('chatUpdate', {name: '', msg: msg, sysmes: 2});
		}
		delete playersList[socket.id]
		trigPlayerScoreboardUpdate();
	});
	
	// Player sent a chat message. Bounce it back to everyone
	socket.on('chatSend', function(data){
		var elem = playersList[socket.id]
		var nme = '<Unknown>'
		if(typeof elem !== 'undefined') nme = elem.name + ' (' + elem.number + ')'
		io.sockets.emit('chatUpdate', {name: nme, msg: data, sysmes: 0});
	});
});


// Send field update and schedule next send
function sendUpdate(){
	io.sockets.emit('fieldUpdate',{data: playersList, lastKick: lastPlayerToKick});
	setTimeout(sendUpdate, 20);
}

// Send match time updates to the players to make sure they are up to date
function sendMatchTime(socket){
	if(!socket){
		io.sockets.emit('timeUpdate', matchTime);
	} else {
		socket.emit('timeUpdate', matchTime);
	}
	setTimeout(sendMatchTime, 60000);
}

// Calculate team counts from playerList
function teamCounts(){
	var k = Object.keys(playersList)
	var blus = 0
	var reds = 0
	for(var i = 0; i < k.length; i++){
		if(playersList[k[i]].side == "R") reds +=1
		if(playersList[k[i]].side == "B") blus +=1
	}
	return {reds: reds, blues: blus}
}

// Find lowest free player number
function freePlayerNum() {
	var nums = subsetObjToArr(playersList, 'number', 'Ball')
	var outNum = 0
	if(nums.length == 0){
		outNum = 1
	} else {
		var maxV = Math.max.apply(null,nums)
		var minV = Math.min.apply(null,nums)
		for (var i = minV; i <= maxV; ++i){
			if(nums.indexOf(i) == -1){
				outNum = i
				break;
			}
		}
		if(outNum == 0) outNum = maxV + 1
	}
	return outNum
}

// Function to subset an object
function subsetObjToArr(obj, key, ignore){
	var k = Object.keys(obj)
	var arr = []
	for(var i = 0; i < k.length; i++){
		if(k[i] == ignore) continue
		arr.push(obj[k[i]][key])
	}
	return arr
} 

///////////////////////////////////////////////////////
///////////// Ball Calculations ///////////////////////


// Function to facilitate ball movement
function MoveBall() {
	// Get players' effect on ball (each next player gets less weight to avoid ball getting insane force when many players touch it)
	var ballElem = playersList['Ball']
	var k = Object.keys(playersList)
	var kickFixed = false
	var kickCount = 1
	var cumEfct = {x: 0, y: 0}
	for(var i = 0; i < k.length; i++){
		if(k[i]=='Ball') continue
		var efct = calcPlayerEffectOnBall(playersList[k[i]], ballElem)
		if(efct.x != 0 || efct.y != 0){
			cumEfct.x += efct.x / kickCount
			cumEfct.y += efct.y / kickCount
			kickCount += 1
			if(!kickFixed){
				kickFixed = true
				lastPlayerToKick.UID = playersList[k[i]].UID
				lastPlayerToKick.name = playersList[k[i]].name
				lastPlayerToKick.number = playersList[k[i]].number
				lastPlayerToKick.side = playersList[k[i]].side
			}
		}
	}
	
	// Update velocities
	tBallVelX = getVelocity(ballElem.xVelocity, cumEfct.x, ballMass, ballVelocityDecay)
	tBallVelY = getVelocity(ballElem.yVelocity, cumEfct.y, ballMass, ballVelocityDecay)
	
	// Test if would go over edge, if yes then bounce (Allow goal space)
	// Check if ball is in goal height (Also count ball's radius of 15 for the horizontal bracket)
	if(ballElem.y + tBallVelY < 312 && ballElem.y + tBallVelY > 254){
		// Do nothing as ball is in the gate height and is allows to pass through X borders
	} else {
		if(ballElem.x + tBallVelX > 838) tBallVelX = -Math.abs(tBallVelX)
		if(ballElem.y + tBallVelY > 539) tBallVelY = -Math.abs(tBallVelY)
		if(ballElem.x + tBallVelX < 61) tBallVelX = Math.abs(tBallVelX)
		if(ballElem.y + tBallVelY < 26) tBallVelY = Math.abs(tBallVelY)
	}
	
	// Check if ball has stopped outside field bounds
	if(tBallVelX == 0 && tBallVelY == 0){
		if(ballElem.y >= 563 || ballElem.y <= 0){
			ballElem.x = 450
			ballElem.y = 282
		}
	}
	
	// Save new position
	playersList['Ball'].x = ballElem.x + tBallVelX
	playersList['Ball'].y = ballElem.y + tBallVelY
	playersList['Ball'].xVelocity = tBallVelX
	playersList['Ball'].yVelocity = tBallVelY	
	
	// Register goal if there was one
	if(playersList['Ball'].x > 853){
		// Ball is in Blue's gate
		scoreBoard.Reds += 1
		// Mark the goal for the player too
		var scrPlyr = playersList[lastPlayerToKick.UID]
		if(typeof scrPlyr !== "undefined"){
			if(scrPlyr.side == "B") playersList[lastPlayerToKick.UID].Score -= 1
			if(scrPlyr.side == "R") playersList[lastPlayerToKick.UID].Score += 1
		}
		sendGoalInf({side: "R", score: scoreBoard, name: lastPlayerToKick.name, number: lastPlayerToKick.number})
	} else if(playersList['Ball'].x < 46) {
		// Ball is in Red's gate
		scoreBoard.Blues += 1
		// Mark the goal for the player too
		var scrPlyr = playersList[lastPlayerToKick.UID]
		if(typeof scrPlyr !== "undefined"){
			if(scrPlyr.side == "R") playersList[lastPlayerToKick.UID].Score -= 1
			if(scrPlyr.side == "B") playersList[lastPlayerToKick.UID].Score += 1
		}
		sendGoalInf({side: "B", score: scoreBoard, name: lastPlayerToKick.name, number: lastPlayerToKick.number})
	} else {
		// No goal -> reschedule next run
		if(gameOn) moveBallTimeHolder = setTimeout(MoveBall, 20);
	}
}

function sendGoalInf(data){
	// Move ball to center in 4 seconds and continue tracking ball's position
	gameOn = false
	setTimeout(function(){
		gameOn = true
		playersList['Ball'].x = 450
		playersList['Ball'].y = 282
		playersList['Ball'].xVelocity = 0
		playersList['Ball'].yVelocity = 0
		io.sockets.emit('continueGame',{gameOn: gameOn});
		MoveBall()
	}, 4000)
	data.gameOn = gameOn
	io.sockets.emit('teamScored', data);
	trigPlayerScoreboardUpdate();
} 

// Function to calculate any player's current effect on the ball
function calcPlayerEffectOnBall(playerElem, ballElem){
	var dist = calcDistance(playerElem.x, ballElem.x, playerElem.y, ballElem.y)
	if(dist < ballTouchDistance){
		var bounceForce = (ballTouchDistance-dist) / ballTouchDistance * ballMaxForce
		var dirX = ballElem.x - playerElem.x
		var dirY = ballElem.y - playerElem.y
		if(dirX == 0 && dirY == 0) dirY = -1
		var tot = Math.abs(dirX)+Math.abs(dirY)
		dirX = (dirX/tot) * bounceForce
		dirY = (dirY/tot) * bounceForce
		return {x: dirX, y: dirY}
	} else return{x: 0, y: 0}
}

// Calculates velocity from old velocity
function getVelocity(curVelocity, Force, Mass, VelocityDecay){
	var newVel = curVelocity * VelocityDecay
	var a = Force/Mass
	newVel = newVel + a
	if(decimalRound(newVel,2) == 0) newVel = 0
	return newVel
}

// Simple function to calculate distances
function calcDistance(x1, x2, y1, y2){
	return Math.sqrt(Math.pow(x1-x2,2)+Math.pow(y1-y2,2))
}

// Simple rounding function
function decimalRound(x, n){
	return Math.round(x*Math.pow(10,n))/Math.pow(10,n)
}

// Function to count match time
function incMatchTime(){
	if(gameOn){
		if(matchTime.sec == 0){
			matchTime.sec = 59
			matchTime.min -= 1
		} else {
			matchTime.sec -= 1
		}
		
		if(matchTime.sec <= 0 && matchTime.min <= 0){
			
			resetMatch()	
			
			matchTime.sec = 0
			matchTime.min = 90
		}
	}
}

// Function to reset match when timer hits 0
function resetMatch(){
	// Stop updating ball's location
	clearTimeout(moveBallTimeHolder)
	gameOn = false
	
	// Tell players that reset happened
	io.sockets.emit('matchReset', {gameOn: gameOn});
	
	// Set ball to center
	playersList['Ball'].x = 450
	playersList['Ball'].y = 282
	playersList['Ball'].xVelocity = 0
	playersList['Ball'].yVelocity = 0
			
	// Schedule game start to 5 seconds
	setTimeout(function(){
		// Switch teams and reset player scores
		var k = Object.keys(playersList)
		for(var i = 0; i < k.length; i++){
			if(playersList[k[i]].side == "R"){
				playersList[k[i]].side = "B"
			} else if(playersList[k[i]].side == "B") {
				playersList[k[i]].side = "R"
			}									
			playersList[k[i]].Score = 0
		}
		
		// Reset score
		scoreBoard.Reds = 0
		scoreBoard.Blues = 0
	
		// Tell players that sides were switched and score was reset
		io.sockets.emit('resetData', {playersList: playersList, scoreBoard: scoreBoard});
		
		// Tell players to redraw player score list
		trigPlayerScoreboardUpdate();
		
		gameOn = true
		io.sockets.emit('continueGame',{gameOn: gameOn});
		MoveBall()
	}, 5000)
}

// Simple function to trigger players score board update on clients
function trigPlayerScoreboardUpdate(){
	io.sockets.emit('updatePlayerScoreboard', playersList);
}
