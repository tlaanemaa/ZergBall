
// var socket = io('ws://zergball-rndm.rhcloud.com:8000'); // This is for OpenShift
var socket = io.connect('', {
	path: '/zergball/socket.io'
});

$(document).ready(function() {
	
	// Set canvas objects
    var canvas = document.getElementById("mainCanvas")
    ctx = canvas.getContext("2d");
	
	// Variable to toggle mouse control
	mouseControl = true;
	mousePos = {x: 0, y: 0}
	mouseSimple = true; // Toggles using simpler mouse calculation
	
	// Variable to toggle leaving paint lines
	paintLines = false;
	
	// Movement settings
	startX = 500
	startY = 334
	Force = 10
	Mass = 10
	PlayerVelocityDecay = 0.9 // this is a multiplier
	RefreshRate = 20
	PlayerColor = "rgba(0,0,0,0.9)" // this gets alter overwritten with data from server
	
	// Variables for movement code
	goLeft = 0
	goUp = 0
	goRight = 0
	goDown = 0
	
	// Last time object positions were updated
	lastUpdate = 0
	
	// Ball velocity decay for extrapolation
	ballVelocityDecay = 0.99
	
	// Variable to hold element locations
	MyLoc = {}
	RemoteList = {}
	
	// Variable to hold match time
	matchTime = {min: 90, sec: 0}
	
	// Variable to hold current game state
	gameOn = false
	isRegd = false
	
	// Variable to hold who kicked the ball last
	lastPlayerToKick = {prev: {name: '', number: '', side: ''}, cur: {name: '', number: '', side: ''}}
	
	// Variable to determine if settings menu is open
	isSettings = false
	
	// Keypress events
	$(document).keydown(function(e) {
		if(isRegd && !isSettings){
			if(e.keyCode === 13){
				// Send chat message
				var msg = $('#msgBox').val()
				if(msg != ''){
					socket.emit('chatSend', msg)
					$('#msgBox').val('')
					return false
				}
			} else if([37, 38, 39, 40].indexOf(e.keyCode) > -1){
				setDirVars(e.which, Force)
				e.preventDefault(); // prevent the default action (scroll / move caret)
			} else if(e.keyCode === 9) {
				// Capture tab to show score board
				if($('div#playerScores').css('opacity') == "0") showPlayerScoreboard(true);
				e.preventDefault(); // prevent the default action (scroll / move caret)
			} else {
				$('#msgBox').focus();
			}
		} else if(isSettings) {
			// Do nothing
		} else {
			if(e.keyCode === 13) $('#regSubmit').click()
		}
		
	});
	
	$(document).keyup(function(e) {
		if([37, 38, 39, 40].indexOf(e.keyCode) > -1){
			setDirVars(e.which, 0)
			e.preventDefault(); // prevent the default action (scroll / move caret)
		} else if(e.keyCode === 9) {
			// Capture tab to hide score board
			if($('div#playerScores').css('opacity') == "1") showPlayerScoreboard(false);
			e.preventDefault(); // prevent the default action (scroll / move caret)
		}
	});
		
	// Set up function to handle field update from server
	socket.on('fieldUpdate', function(data){
		lastUpdate = new Date();
		RemoteList = data.data
		lastPlayerToKick.cur = data.lastKick
	 });
		
	// Set up function to registration response
	socket.on('getReg', function(data){
		// Save player data
		MyLoc = data.player
		// Write out current score
		$('div.scoreBoard div#redScore').text(data.score.Reds)
		$('div.scoreBoard div#blueScore').text(data.score.Blues)
		
		// Start game functions
		gameOn = true
		isRegd = true
		UpdateField()
		ReDraw()
		updateLastKick()
		setInterval(incTime, 1000);
		
		// Fade the playfield and other stuff in and registration menu out
		$('div#regBlock').animate({
			'margin-top': 140,
			opacity: 0
		}, 300, function(){
			$('div.outCont').animate({
				'margin-top': 0,
				opacity: 1
			}, 300, function() {
				$('div.footerTxt').animate({
					opacity: 0.25
				}, 300);
			});
			$('div#regCont').css({'display':'none'});
			drawPlayerScores(RemoteList);
		});
		
	 });
	
	// Set up function to handle player score board update messages
	socket.on('updatePlayerScoreboard', function(playerList){
		drawPlayerScores(playerList);
	});
	
	// Set up function to handle goal messages
	socket.on('teamScored', function(data){
	x = data
		gameOn = data.gameOn
		$('div.scoreBoard div#redScore').text(data.score.Reds)
		$('div.scoreBoard div#blueScore').text(data.score.Blues)
		if(data.side == "B"){
			$('div#scoreAlert div#scoresTxt').text(data.name + ' (' + data.number + ') scores a goal for the Blue team!')
			$('div#scoreAlert div#scoresTxt').removeClass('forRed forBlue').addClass('forBlue')
		} else {
			$('div#scoreAlert div#scoresTxt').text(data.name + ' (' + data.number + ') scores a goal for the Red team!')
			$('div#scoreAlert div#scoresTxt').removeClass('forBlue forRed').addClass('forRed')
		}
		
		$('div.mainCont div#scoreAlert').css({'display':'block'})
		$('div.mainCont div#scoreAlert').animate({
			opacity: 1
		}, 200)
	 });
	
	// Set up function to handle game state changes
	socket.on('continueGame', function(data){
		if($('div#playerScores').css('opacity') == "1") showPlayerScoreboard(false);
		$('div.mainCont div#scoreAlert').animate({
			opacity: 0
		}, 200, function(){
			$('div.mainCont div#scoreAlert').css({'display':'none'})
			gameOn = data.gameOn
		})
		
	})
	
	// Set up function to handle losing focus on window
	$(window).blur(function() {
		goLeft = 0
		goUp = 0
		goRight = 0
		goDown = 0
	})
	
	// Fade in the registration window
	$('div#regBlock').animate({
		'margin-top': 100,
		opacity: 1
	}, 500)
	
	// Set focus to the name box on registration form
	$('#playerName').focus()
	
	// Set on click event on registration submit button
	$('#regSubmit').click(function() {
		// Ask to be registered on server
		var nme = $(this).parent().find('#playerName').val()
		nme = nme.substring(0,1).toUpperCase() + nme.substring(1,200)
		socket.emit('askReg', {name:nme})
	});
	
	// Set up event to handle chat updates from server
	socket.on('chatUpdate', function(data){
		var elem = $('#msgLog')
		if(data.sysmes == 0){
			elem.append('<div class="msgElem"><span class="msgElemName">' + data.name + ':</span> ' + data.msg + '</div><br>');
		} else if(data.sysmes == 1) {
			elem.append('<div class="msgElem"><span class="msgElemJoin">' + data.msg + '</span></div><br>');
		} else if(data.sysmes == 2) {
			elem.append('<div class="msgElem"><span class="msgElemLeave">' + data.msg + '</span></div><br>');
		} else if(data.sysmes == 3) {
			elem.append('<div class="msgElem"><span class="msgElemPersn">' + data.msg + '</span></div><br>');
		}
		elem.scrollTop(elem[0].scrollHeight)
	 });
	 
	 // Set up event to handle match time updates from server
	 socket.on('timeUpdate', function(data){
		matchTime = data
		incTime()
	 });
	
	// Set up function to handle match resets (timer ran to 0)
	socket.on('matchReset', function(data){
		gameOn = data.gameOn
		if($('div#playerScores').css('opacity') == "0") showPlayerScoreboard(true);
	 });
	
	// Set up function to switch player sides and reset score
	socket.on('resetData', function(data){
		var me = data.playersList[MyLoc.UID]
		if(typeof me !== 'undefined') MyLoc.side = me.side
		$('div.scoreBoard div#redScore').text(data.scoreBoard.Reds)
		$('div.scoreBoard div#blueScore').text(data.scoreBoard.Blues)
	 });
	
	// Set up event to handle mouse movement on canvas
	$('body').mousemove(function(e){
		if(mouseControl) {
			var offst = $('#mainCanvas').offset();
			mousePos = {x: e.pageX - offst.left, y: e.pageY - offst.top};
		}
	});
		
	// Set up event handler for input selection on registration screen
	$('div.regInpB').click(function() {
		$('div.regInpB').removeClass('selected')
		if($(this).hasClass('left')){
			$('div.regInpB.left').addClass('selected')
			mouseControl = false;
		} else {
			$('div.regInpB.right').addClass('selected')
			mouseControl = true;
		}
	});
	
	// Set up event handler for mouse smoothing setting
	$('div.smoothing').click(function() {
		$('div.smoothing').removeClass('selected')
		if($(this).hasClass('left')){
			$('div.smoothing.left').addClass('selected')
			mouseSimple = true;
		} else {
			$('div.smoothing.right').addClass('selected')
			mouseSimple = false;
		}
	});
	
	// Set up event handler for paint trail setting
	$('div.trail').click(function() {
		$('div.trail').removeClass('selected')
		if($(this).hasClass('left')){
			$('div.trail.left').addClass('selected')
			paintLines = true;
		} else {
			$('div.trail.right').addClass('selected')
			paintLines = false;
		}
	});
	
	// Set up event to open settings menu on click
	$('div#settingsButton').click(function() {
		if($('div#settingsCont').css('opacity') == "0"){
			showSettings(true);
		}else if($('div#settingsCont').css('opacity') == "1"){
			showSettings(false);
		}
	});
	
	// Set up event to open player scoreboard when user clicks the button
	$('div#scoreButton').click(function() {
		if($('div#playerScores').css('opacity') == "0"){
			showPlayerScoreboard(true)
		}else if($('div#playerScores').css('opacity') == "1"){
			showPlayerScoreboard(false)
		}
	});
	
	// Set up event to allow changing force
	$('input#forceVal').change(function() {
	  Force = Number($('input#forceVal').val())
	});
	
	// Set up event to allow changing friction
	$('input#frictVal').change(function() {
	  PlayerVelocityDecay = 1 - Number($('input#frictVal').val())
	});
	
	// Set up event to close menus over canvas when user clicks elsewhere
	$(document).click(function() {
		if($('div#settingsCont').css('opacity') == "1") showSettings(false);
		if($('div#playerScores').css('opacity') == "1") showPlayerScoreboard(false);
	})
	
	// Stop click event bubbling on settings menu
	$('div#settingsCont').click(function(e) {
		e.stopPropagation()
	})
	
	// Stop click event bubbling on score menu
	$('div#playerScores').click(function(e) {
		e.stopPropagation()
	})
	
	// Close parent element wen X is pressed
	$('img.closeXButton').click(function() {
		$(this).parent().animate({
			opacity: 0
		}, 200, function(){
			$(this).css({'display': 'none'})
		});
	})
	
});

// Master function that calls relevant functions to update field
function UpdateField(){
	
	// Move my character and emit my new location to server
	MoveObject(MyLoc, 'Me')
	socket.emit('sendPos', MyLoc);
	
	// If last update from other players was ages ago, extrapolate their position. Only allow predicting ball location if game is on.
	if(new Date() - lastUpdate > RefreshRate){
		var keysR = Object.keys(RemoteList)
		var myky = MyLoc.UID
		for(i=0; i < keysR.length; i++){
			if(keysR[i]==myky) continue
			if(keysR[i]=='Ball' && !gameOn) continue
			MoveObject(RemoteList[keysR[i]], keysR[i]);
		}
	}
		
	// Schedule rerun of this function
	setTimeout(UpdateField, RefreshRate);
}

// Defines keypress effects on player movement
function setDirVars(key, frc){
	switch(key){
		case 37:
		goLeft=frc;
		break;
		
		case 38:
		goUp=frc;
		break;
		
		case 39:
		goRight=frc;
		break;
		
		case 40:
		goDown=frc;
		break;
	}
}

// Calculates velocity from old velocity
function getVelocity(curVelocity, Force, Mass, VelocityDecay){
	var newVel = curVelocity * VelocityDecay
	var a = Force/Mass
	newVel = newVel + a
	if(decimalRound(newVel,2) == 0) newVel = 0
	return newVel
}

// Simple rounding function
function decimalRound(x, n){
	return Math.round(x*Math.pow(10,n))/Math.pow(10,n)
}

// Calculates movements for all objects
function MoveObject(data, id){
	// Calculate force for this player or other players
	if(id=='Me'){
		// Calculate force from mouse if mouse control is enabled
		if(mouseControl) {
			
			var xDist = mousePos.x - data.x
			var yDist = mousePos.y - data.y
			
			if(mouseSimple && Math.abs(xDist) < 15 && Math.abs(yDist) < 15){
				var curVelociDecay = 0.7
				var mouseForce = Force / (1 - PlayerVelocityDecay) * (1 - curVelociDecay)
			} else {
				var mouseForce = Force
				var curVelociDecay = PlayerVelocityDecay
			}
			
			var xForce = Math.min(Math.abs(xDist), mouseForce) * custSign(xDist)
			var yForce = Math.min(Math.abs(yDist), mouseForce) * custSign(yDist)
			var maxDist = Math.max(Math.abs(xDist), Math.abs(yDist))
			xForce = xForce * (Math.abs(xDist)/maxDist)
			yForce = yForce * (Math.abs(yDist)/maxDist)
			
		} else {
			var xForce = goRight-goLeft
			var yForce = goDown-goUp
			var curVelociDecay = PlayerVelocityDecay
		}
		// Rescale x and y to avoid moving faster when going diagonally
		var reSc = rescaleXY(xForce, yForce)
		xForce = reSc.x
		yForce = reSc.y
		
	} else {
		var xForce = 0
		var yForce = 0
		if(id=='Ball') {
			var curVelociDecay = ballVelocityDecay
		} else {
			var curVelociDecay = 1
		}
	}

	// Get current position
	var x = data.x
	var y = data.y
	
	
	// Update velocities
	var VelX = getVelocity(data.xVelocity, xForce, Mass, curVelociDecay)
	var VelY = getVelocity(data.yVelocity, yForce, Mass, curVelociDecay)
		
	// Test if would go over edge, if yes then bounce
	if(x + VelX > 885) VelX = -Math.abs(VelX)
	if(y + VelY > 548) VelY = -Math.abs(VelY)
	if(x + VelX < 15) VelX = Math.abs(VelX)
	if(y + VelY < 15) VelY = Math.abs(VelY)
	
	// Calculate new position
	x = x + VelX
	y = y + VelY
	
	// Save new position
	if(id=="Me"){
		MyLoc.x = x
		MyLoc.y = y
		MyLoc.xVelocity = VelX
		MyLoc.yVelocity = VelY
	} else {
		RemoteList[id].x = x
		RemoteList[id].y = y
		RemoteList[id].xVelocity = VelX
		RemoteList[id].yVelocity = VelY
	}
}

// Redraws the field
function ReDraw() {
	var keysR = Object.keys(RemoteList)
	if(!paintLines) ctx.clearRect(0,0,1000,688)

	// Draw other players
	var myky = MyLoc.UID
	for(i=0; i < keysR.length; i++){
		if(keysR[i]==myky) continue
		if(keysR[i]=='Ball') continue
		
		var elem = RemoteList[keysR[i]]
		ctx.beginPath()
		ctx.arc(elem.x, elem.y, 15, 0, Math.PI*2)
		ctx.fillStyle = getColor(elem.side)
		ctx.fill()
		drawNumber(elem.x, elem.y, elem.number)
	}
	
	// Draw ball
	var elem = RemoteList['Ball']
	if(typeof elem !== 'undefined'){
		var img = new Image();
		img.src = '/www/img/ball.png'
		ctx.drawImage(img,elem.x-15,elem.y-15);
	}
	
	// Draw player (add white circle around player)
	ctx.beginPath()
	ctx.arc(MyLoc.x, MyLoc.y, 15, 0, Math.PI*2)
	ctx.fillStyle = "rgba(255,255,255,1)"
	ctx.fill()
	ctx.beginPath()
	ctx.arc(MyLoc.x, MyLoc.y, 13, 0, Math.PI*2)
	ctx.fillStyle = getColor(MyLoc.side)
	ctx.fill()
	drawNumber(MyLoc.x, MyLoc.y, MyLoc.number)
	
	// Schedule next run of this function
	setTimeout(ReDraw, RefreshRate);
} 

// Returns color code from R or B team value
function getColor(side){
	if(side=="R"){
		return "rgba(150,0,0,0.9)"
	} else if(side=="B") {
		return "rgba(0,50,150,0.9)"
	} else if(side=="Ball") {
		return "rgba(250,250,250,1)"
	}
}

// Function to keep track who kicked the ball last
function updateLastKick(){
	if(lastPlayerToKick.cur.number != lastPlayerToKick.prev.number || lastPlayerToKick.cur.name != lastPlayerToKick.prev.name || lastPlayerToKick.cur.side != lastPlayerToKick.prev.side){
		if(lastPlayerToKick.cur.side == "R"){
			$('#lastKickBox').removeClass('lastKickRed lastKickBlue').addClass('lastKickRed')
		} else {
			$('#lastKickBox').removeClass('lastKickRed lastKickBlue').addClass('lastKickBlue')
		}
		$('#lastKickBox').text('Last kick: ' + lastPlayerToKick.cur.name + ' (' + lastPlayerToKick.cur.number + ')')
		lastPlayerToKick.prev = lastPlayerToKick.cur
	}
	setTimeout(updateLastKick, 100)
}

// Function to draw numbers on player elements
function drawNumber(x, y, num){
		ctx.font = "14px Changa One";
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#FFFFFF';
		ctx.fillText(num, x, y);
}

// Function to increment matchTime
function incTime(){
	if(gameOn){
		if(matchTime.sec == 0){
			matchTime.sec = 59
			matchTime.min -= 1
		} else {
			matchTime.sec -= 1
		}
		if(matchTime.sec <= 0 && matchTime.min <= 0){
			matchTime.sec = 0
			matchTime.min = 90
		}
		$('div.scoreBoard div#timeBox').text(leftPad(matchTime.min,2) + ':' + leftPad(matchTime.sec,2))
	}
}

// Simple function left pad numbers (1 becomes 01)
function leftPad(number, targetLength) {
    var output = number + '';
    while (output.length < targetLength) {
        output = '0' + output;
    }
    return output;
}

// Function to refresh the player score board
function drawPlayerScores(playerList) {
	var targt = $('div#playerScores')
	var kys = Object.keys(playerList)
	// Remove old score information
	targt.find('#redSide *').remove()
	targt.find('#blueSide *').remove()
	// Loop through players and add new scores
	for(i=0; i < kys.length; i++){
		if(kys[i]=='Ball') continue
		var elem = playerList[kys[i]]
		if(elem.side == "R"){
			targt.find('#redSide').append('<div class="playerScoreCont"><div class="playerScoreName">' + elem.name + ' (' + elem.number + ')</div><div class="playerScoreVal">' + elem.Score + '</div></div>');
		} else if(elem.side == "B") {
			targt.find('#blueSide').append('<div class="playerScoreCont"><div class="playerScoreVal">' + elem.Score + '</div><div class="playerScoreName">' + elem.name + ' (' + elem.number + ')</div></div>');
		}
	}
}

// Simple function to show and hide player score board
function showPlayerScoreboard(show){
	if(show){
		$('#playerScores').css({'display': 'block'});
		$('#playerScores').animate({
			opacity: 1
		}, 200);
	} else if(!show){
		$('#playerScores').animate({
			opacity: 0
		}, 200, function(){
			$('#playerScores').css({'display': 'none'});
		})
	}
}

// Simple function to show and hide settings
function showSettings(show){
	if(show){
		isSettings = true
		$('div#settingsCont').css({'display': 'block'})
		$('div#settingsCont').animate({
			opacity: 1
		}, 200);
	} else if($('div#settingsCont').css('opacity') == "1"){
		$('div#settingsCont').animate({
			opacity: 0
		}, 200, function(){
			$('div#settingsCont').css({'display': 'none'})
			isSettings = false
		});
	}
}

// Simple function to calculate value's sign (IE doesnt support Math.sign)
function custSign(val){
	return val / Math.abs(val)
}

// Simple function to rescale x and y force (avoids giving too much speed when going diagnonally)
function rescaleXY(x, y){
	if(y == 0 || x == 0) return {x: x, y: y}
	var maxV = Math.max(Math.abs(x), Math.abs(y)) * custSign(y)
	var newY = maxV/Math.sqrt(Math.pow(x/y, 2) + 1)
	var newX = x / y * newY
	return {x: newX, y: newY}
}