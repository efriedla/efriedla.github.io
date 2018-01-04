$(document).ready(function(){
	
	$('ul.tabs li').click(function(){
		var tab_id = $(this).attr('data-tab');

		$('ul.tabs li').removeClass('current');
		$('.tab-content').removeClass('current');

		$(this).addClass('current');
		$("#"+tab_id).addClass('current');
	});


	// show email
	// function showEmail() {
	// 	alter("clicked");
	// 	// $("#myEmail").innerHTML = "Hello World";
	// }
	$("#showEmail").click(function(){
		
		$("#myEmail").text("efriedla20852@gmail.com");
    });

});