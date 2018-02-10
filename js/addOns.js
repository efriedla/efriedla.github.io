$(document).ready(function(){
	//Portfolio Tabs
	// on tab click
	$('ul.tabs li').click(function(){
		var tab_id = $(this).attr('data-tab');
		//shows content on current tab
		$('ul.tabs li').removeClass('current');
		$('.tab-content').removeClass('current');
		//add class to be shown
		$(this).addClass('current');
		$("#"+tab_id).addClass('current');
	});

	// show email
	$("#showEmail").click(function(){
		$("#myEmail").text("efriedla20852@gmail.com");
	});
	//tabs
	
});