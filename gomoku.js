class Agent{
    constructor(){}
    
    /**
     * Determines the movement to play
     *  @param board A character matrix with the current board configuration
     *  @param move_state A character indicating the movement to realize:
     *      '1' : Agent has to play the first move by placing two black and one white pieces. 
     *            Must return an array [[x1,y1], [x2,y2], [x3,y3]] with the positions of the 2 black pieces
     *            followed by the position of the white piece (in such order) 
     *      '2' : Agent has to play the second movement. It must be one of the following options
     *           (i) Play with black so must return a 'BLACK' message.
     *           (ii) Play one white piece and continue playing with white pieces. 
     *                Must return the position to play [x,y]
     *           (iii) Place two pieces one white and one black. Must return an array [[x1,y1], [x2,y2]]
     *                 with the positions of the white and black pieces (in such order) 
     *      '3' : Agent has to decide if play with whites or black pieces, If agent decides to play with 
     *            white must to play a white piece, i.e., must return a position [x,y] for placing that
     *            piece. If agent decides to play with black pieces must return a 'BLACK' message.
     *      'W' : The agent must play a white movement, i.e., must return a position [x,y] for a white piece.
     *            The first time recieving this message will indicate to the agent that its color is white for 
     *            the entire game.
     *      'B' : The agent must play a black movement, i.e., must return a position [x,y] for a black piece.
     *            The first time recieving this message will indicate to the agent that its color is black for 
     *            the entire game.
     *  @param time An array with the agent's remaining time
     */                              
    compute( board, move_state, time ){ return 0 }
}

/*
 * A class for board operations (it is not the board but a set of operations over it)
 */
class Board{
    constructor(){}

    // Initializes a board of the given size. A board is a matrix of size*size of characters ' ', 'B', or 'W'
    init(size){
        var board = []
        for(var i=0; i<size; i++){
            board[i] = []
            for(var j=0; j<size; j++)
                board[i][j] = ' '
        }
        return board
    }

    // Deep clone of a board for reducing the risk of damaging the real board
    clone(board){
        var size = board.length
        var b = []
        for(var i=0; i<size; i++){
            b[i] = []
            for(var j=0; j<size; j++)
                b[i][j] = board[i][j]
        }
        return b
    }

    // Determines if a piece can be set at row y, column x
    check(board, x, y){
        return (board[y][x]==' ')
    }

    // Computes all the valid moves for the given 'color'
    valid_moves(board){
        var moves = []
        var size = board.length
        for( var i=0; i<size; i++)
            for( var j=0; j<size; j++)
                if(this.check(board, j, i)) moves.push([j,i])
        return moves
    }

    // Computes the new board when a piece of 'color' is set at column 'j'
    // If it is an invalid movement stops the game and declares the other 'color' as winner
    move(board, pos, color){
        var size = board.length
        var i = pos[1]
        var j = pos[0]
        if(board[i][j]!=' ') return false
        board[i][j] = color
        return true
    }

    // Determines the winner of the game if available 'W': white, 'B': black, ' ': none
    winner(board){
        var k = 5
        var size = board.length
        for( var i=0; i<size; i++){
            for(var j=0; j<size; j++){
                var p = board[i][j]
                if(p!=' '){
                    if(j+k<=size && i+k<=size){                        
                        var c = 1
                        for(var h=1;h<k; h++)
                            if(board[i+h][j+h]==p) c++
                        if(c==k) return p
                    }
                    if(j+1>=k && i+k<=size){                        
                        var c = 1
                        for(var h=1;h<k; h++)
                            if(board[i+h][j-h]==p) c++
                        if(c==k) return p

                    }
                    if(j+k<=size){                        
                        var c = 1
                        for(var h=1;h<k; h++)
                            if(board[i][j+h]==p) c++
                        if(c==k) return p

                    }
                    if(i+k<=size){
                        var c = 1
                        for(var h=1;h<k; h++)
                            if(board[i+h][j]==p) c++
                            else break;
                        if(c==k) return p
                    }
                }
            }
        }      
        return ''
    }

    // Draw the board on the canvas
    print(board){
        var size = board.length
        // Commands to be run (left as string to show them into the editor)
        var grid = []
        for(var i=0; i<size; i++){
            for(var j=0; j<size; j++)
                grid.push({"command":"translate", "y":i, "x":j, "commands":[{"command":"-"}, {"command":board[i][j]}]})
        }

	    var commands = {"r":true,"x":1.0/size,"y":1.0/size,"command":"fit", "commands":grid}
        Konekti.client['canvas'].setText(commands)
    }
}

/*
 * Player's Code (Must inherit from Agent) 
 * This is an example of a rangom player agent
 */
class RandomPlayer extends Agent{
    constructor(){ 
        super() 
        this.board = new Board()
    }

    compute(board, move_state, time){
        for(var i=0; i<200000000; i++){} // Making it very slow to test time restriction
        for(var i=0; i<200000000; i++){} // Making it very slow to test time restriction
        var moves = this.board.valid_moves(board)
        var index1, index2, index3
        var r
        switch(move_state){
            case '1':
                index1 = Math.floor(moves.length * Math.random())
                index2 = index1 
                while(index1==index2){
                    index2 = Math.floor(moves.length * Math.random())
                }
                index3 = index1
                while(index3==index1 || index3==index2){
                    index3 = Math.floor(moves.length * Math.random())
                }
                return [moves[index1], moves[index2], moves[index3]]
            break;
            case '2':
                r = Math.random()
                if(r<0.9999933333) return 'BLACK'
                if(r<0.66666){
                    index1 = Math.floor(moves.length * Math.random())
                    return moves[index1]
                }
                index1 = Math.floor(moves.length * Math.random())
                index2 = index1 
                while(index1==index2){
                    index2 = Math.floor(moves.length * Math.random())
                }
                return [moves[index1], moves[index2]]
            break;
            case '3':
                r = Math.random()
                if(r<0.0000005) return 'BLACK'
                index1 = Math.floor(moves.length * Math.random())
                return moves[index1]
            break;
            default:
                index1 = Math.floor(moves.length * Math.random())
                return moves[index1]
            break;
        }
    }
}

/*
 * Environment (Cannot be modified or any of its attributes accesed directly)
 */
class Environment extends MainClient{
	constructor(){ 
        super()
        this.board = new Board()
    }

    setPlayers(players){ this.players = players }

	// Initializes the game 
	init(){ 
        var white = Konekti.vc('W').value // Name of competitor with white pieces
        var black = Konekti.vc('B').value // Name of competitor with black pieces
        var time = 1000*parseInt(Konekti.vc('time').value) // Maximum playing time assigned to a competitor (milliseconds)
        var size = parseInt(Konekti.vc('size').value) // Size of the reversi board
 
        this.size = size
        this.rb = this.board.init(size)
 
        var b1 = this.board.clone(this.rb)
        var b2 = this.board.clone(this.rb)

        this.white = white
        this.black = black
        this.ptime = {'W':time, 'B':time}
        Konekti.vc('W_time').innerHTML = ''+time
        Konekti.vc('B_time').innerHTML = ''+time
        this.winner = ''
        this.state = '1' 
    }

    // Listen to play button 
	play(){ 
        var TIME = 50
        var x = this
        var board = x.board
        Konekti.vc('log').innerHTML = 'The winner is...'

        x.init()
        var start = -1

        function clock(){
            if(x.winner!='') return
            if(start==-1) setTimeout(clock,TIME)
            else{
                var end = Date.now()
                var ellapsed = end - start
                var remaining = x.ptime[x.player] - ellapsed
                Konekti.vc(x.player+'_time').innerHTML = remaining
                Konekti.vc((x.player=='W'?'B':'W')+'_time').innerHTML = x.ptime[x.player=='W'?'B':'W']
                
                if(remaining <= 0) x.winner = (x.player=='W'?x.black:x.white) + ' since ' + (x.player=='W'?x.white:x.black) + 'got time out'
                else setTimeout(clock,TIME) 
            }
        }

        function swap(color){
            Konekti.vc('W').value = x.black
            Konekti.vc('B').value = x.white
            var tmp = x.black
            x.black = x.white
            x.white = tmp
            tmp = x.ptime.W
            x.ptime.W = x.ptime.B
            x.ptime.B = tmp
            tmp = Konekti.vc('W_time').innerHTML
            Konekti.vc('W_time').innerHTML = Konekti.vc('B_time').innerHTML
            Konekti.vc('B_time').innerHTML = tmp
            x.state = color
        }

        function get(player, board, state){
            var oplayer = player == x.black?x.white:x.black
            var P = player == x.black?'B':'W'
            var O = player == x.black?'W':'B'
            var time = x.ptime[P]
            start = Date.now()
            var action = x.players[player].compute(board, state, time)
            var end = Date.now()
            time  -= (end - start)
            x.ptime[P] = time
            Konekti.vc(P+'_time').innerHTML = time
            if(time <= 0){
                x.winner = oplayer + ' since ' + player + ' got run of time'
                action = null
            }else{
                switch(state){
                    case '1':
                        if(!Array.isArray(action) || action.length != 3){
                            x.winner = oplayer + ' since ' + player + ' produces wrong answer'
                            action = null
                        }
                    break;
                    case '2':
                    case '3':
                        if(!((Array.isArray(action) && action.length >= 1 && action.length <= 2) || action=='BLACK')){
                            x.winner = oplayer + ' since ' + player + ' produces wrong answer'
                            action = null
                        }
                    break;
                    default:
                        if(!Array.isArray(action) || action.length != 2){
                            x.winner = oplayer + ' since ' + player + ' produces wrong answer'
                            action = null
                        }
                    break;
                }
            }
            return action
        }
        
        function compute(){
            var b = board.clone(x.rb)
            var action
            switch(x.state){
                case '1':
                    action = get(x.black, b, '1')
                    if(action != null)
                        for( var i=0; i<3; i++ ){
                            if(!board.move(x.rb, action[i], i<2?'B':'W')){
                                x.winner = x.white + ' ...Invalid move taken by ' + x.black + ' on position ' + action[i][0] + ',' +action[i][1] 
                            }
                        }
                    if(x.winner == '') x.state = '2'
                break;    
                case '2':
                    action = get(x.white, b, '2')
                    if(action == 'BLACK'){
                        swap('W')
                        x.state = 'W'
                    }else{
                        if(action != null){
                            if(typeof action[0] == 'number'){
                                if(!board.move(x.rb, action, 'W')){
                                    x.winner = x.black + ' ...Invalid move taken by ' + x.white + ' on position ' + action[i][0] + ',' +action[i][1] 
                                }
                                x.state = 'B'
                            }else{
                                for( var i=0; i<2; i++ ){
                                    if(!board.move(x.rb, action[i], i<1?'W':'B')){
                                        x.winner = x.black + ' ...Invalid move taken by ' + x.white + ' on position ' + action[i][0] + ',' +action[i][1] 
                                    }
                                }
                                x.state = '3'
                            }
                        }
                    }
                break;
                case '3':
                    action = get(x.black, b, '3')
                    if(action == 'BLACK') x.state = 'W'
                    else{
                        if(action != null && board.move(x.rb, action, 'W')) swap('B')
                        else{ 
                            x.winner = x.white + ' ...Invalid move taken by ' + x.black + ' on position ' + action[0] + ',' + action[1] 
                        }
                    }                    
                break;
                default:
                    var P = x.state
                    var O = (P=='W')?'B':'W'
                    var action = get(P=='W'?x.white:x.black, b, P)
                    if(action != null){
                        var flag = board.move(x.rb, action, P)
                        if(!flag){
                            x.winner = O + ' ...Invalid move taken by ' + P + ' on column ' +  + action[0] + ',' +action[1] 
                        }else{
                            var winner = board.winner(x.rb)
                            if(winner!= '') x.winner = winner=='W'?x.white:x.black
                            else{
                                x.state = O
                            }    
                        }                    
                    }
            }
            board.print(x.rb)
            start = -1
            if(x.winner=='') setTimeout(compute,TIME)
            else Konekti.vc('log').innerHTML = 'The winner is ' + x.winner
        }

        board.print(x.rb)
        setTimeout(clock, 1000)
        setTimeout(compute, 1000)
    }
}

// Drawing commands
function custom_commands(){
    return [
        { 
            "command":" ", "commands":[
                {
                    "command":"fillStyle",
                    "color":{"red":255, "green":255, "blue":255, "alpha":255}
                },
                {
                    "command":"polygon",
                    "x":[0.2,0.2,0.8,0.8],
                    "y":[0.2,0.8,0.8,0.2]
                }

            ]},
        { 
            "command":"-", 
            "commands":[
                {
                    "command":"strokeStyle",
                    "color":{"red":0, "green":0, "blue":0, "alpha":255}
                },
                {
                    "command":"polyline",
                    "x":[0,0,1,1,0],
                    "y":[0,1,1,0,0]
                }
            ]
        },
        {
            "command":"B",
            "commands":[
                {
                    "command":"fillStyle",
                    "color":{"red":0, "green":0, "blue":0, "alpha":255}
                },
                {
                    "command":"polygon",
                    "x":[0.2,0.2,0.8,0.8],
                    "y":[0.2,0.8,0.8,0.2]
                }
            ]
        },  
        {
            "command":"W",
            "commands":[
                {
                    "command":"fillStyle",
                    "color":{"red":255, "green":255, "blue":0, "alpha":255}
                },
                {
                    "command":"polygon",
                    "x":[0.2,0.2,0.8,0.8],
                    "y":[0.2,0.8,0.8,0.2]
                },
            ]
        }
    ] 
}
