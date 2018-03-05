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
		$("#myEmail").toggle("slow", function(){
			$("#myEmail").text("efriedla20852@gmail.com");
		})
	});
	//navbar
	$('body').scrollspy({target: ".navbar", offset: 50});   

	// Add smooth scrolling on all links inside the navbar
	$("#mainNavr a").on('click', function(event) {
	  // Make sure this.hash has a value before overriding default behavior
	  if (this.hash !== "") {
		// Prevent default anchor click behavior
		event.preventDefault();
  
		// Store hash
		var hash = this.hash;
  
		// Using jQuery's animate() method to add smooth page scroll
		// The optional number (800) specifies the number of milliseconds it takes to scroll to the specified area
		$('html, body').animate({
		  scrollTop: $(hash).offset().top
		}, 800, function(){
	 
		  // Add hash (#) to URL when done scrolling (default click behavior)
		  window.location.hash = hash;
		});
	  }  // End if
	});
	
});

