import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([
    { text: "Hello! I'm your fashion assistant. Choose an option below to get started!", sender: 'bot' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeService, setActiveService] = useState(null); // 'recommendation', 'generation', or 'tryon'
  const messagesEndRef = useRef(null);
  
  // Virtual Try-On States
  const [avatarImage, setAvatarImage] = useState(null);
  const [clothingImage, setClothingImage] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [clothingPreview, setClothingPreview] = useState(null);
  const [tryOnOptions, setTryOnOptions] = useState({
    avatarSex: 'None',
    seed: '',
    avatarPrompt: '',
    clothingPrompt: '',
    backgroundPrompt: ''
  });
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  
  // Define the API URLs as constants
  const RECOMMENDATION_API_URL = 'http://127.0.0.1:5000';
  const GENERATION_API_URL = 'http://127.0.0.1:5001';
  const TRYON_API_URL = 'http://127.0.0.1:8080'; // Assuming your Flask try-on app runs on port 8080

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  // Adding the service options message to the chat
  const renderServiceOptions = () => {
    return {
      text: "Please choose a service:",
      sender: 'bot',
      serviceOptions: true
    };
  };

  const selectService = (service) => {
    setActiveService(service);
    let welcomeMessage = "";
    
    if (service === 'recommendation') {
      welcomeMessage = "Great! I'll help you find existing outfit combinations. Describe what you're looking for (e.g., 'red shirt paired with jeans'), and I'll suggest matches from our catalog.";
    } else if (service === 'generation') {
      welcomeMessage = "Awesome! I'll help you create custom outfit visualizations. Describe your ideal outfit with specific details (e.g., 'Pink Frock with puff sleeves and white stripes'), and I'll generate a unique image for you.";
    } else if (service === 'tryon') {
      welcomeMessage = "Perfect! I'll help you virtually try on outfits. Upload your photo and a clothing item image, and I'll show you how the clothing would look on you.";
      setMessages(prev => [...prev, 
        { text: welcomeMessage, sender: 'bot' },
        { text: "Upload your avatar image and clothing image to see the virtual try-on result.", sender: 'bot', tryOnUpload: true }
      ]);
      return;
    }
    
    setMessages(prev => [...prev, { text: welcomeMessage, sender: 'bot' }]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (activeService === 'tryon') {
      handleTryOnSubmit();
      return;
    }
    
    if (!inputValue.trim()) return;
    if (!activeService) {
      setMessages(prev => [...prev, { 
        text: "Please select either 'Outfit Recommendation', 'Customized Outfit Generation', or 'Virtual Try-On' to continue.", 
        sender: 'bot' 
      }]);
      return;
    }
    
    // Add user message to chat
    const userMessage = { text: inputValue, sender: 'user' };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    
    try {
      if (activeService === 'recommendation') {
        await handleRecommendationRequest(userMessage.text);
      } else {
        await handleGenerationRequest(userMessage.text);
      }
    } catch (error) {
      console.error(`Error with ${activeService} request:`, error);
      setMessages(prev => [...prev, { 
        text: `Sorry, I couldn't process your request. Please try again.`, 
        sender: 'bot' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecommendationRequest = async (query) => {
    const recommendUrl = `${RECOMMENDATION_API_URL}/recommend`;
    console.log('Sending recommendation request to:', recommendUrl);
    
    const response = await fetch(recommendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response body:', errorText);
      throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Received recommendation data:', data);
    
    const botResponse = {
      text: "Here are some recommendations for you from our catalog:",
      sender: 'bot',
      recommendations: data
    };
    
    setMessages(prev => [...prev, botResponse]);
  };

  const handleGenerationRequest = async (query) => {
    const generateUrl = `${GENERATION_API_URL}/generate`;
    console.log('Sending generation request to:', generateUrl);
    
    const response = await fetch(generateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        prompt: query,
        speed: 'balanced' 
      }),
    });
    
    if (!response.ok) {
      if (response.headers.get('Content-Type')?.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Network response was not ok: ${response.status}`);
      } else {
        throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
      }
    }
    
    const imageBlob = await response.blob();
    console.log('Received generated image');
    
    const imageUrl = URL.createObjectURL(imageBlob);
    
    const botResponse = {
      text: "Here's your custom generated outfit based on your description:",
      sender: 'bot',
      generatedImage: imageUrl
    };
    
    setMessages(prev => [...prev, botResponse]);
  };

  // Virtual Try-On functions
  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (type === 'avatar') {
        setAvatarImage(file);
        setAvatarPreview(event.target.result);
      } else {
        setClothingImage(file);
        setClothingPreview(event.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleTryOnOptionChange = (e) => {
    const { name, value } = e.target;
    setTryOnOptions(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleTryOnSubmit = async () => {
    if (!avatarImage || !clothingImage) {
      setMessages(prev => [...prev, {
        text: "Please upload both an avatar image and a clothing image to continue.",
        sender: 'bot'
      }]);
      return;
    }
  
    setIsLoading(true);
    setMessages(prev => [...prev, {
      text: "Processing your virtual try-on request...",
      sender: 'bot'
    }]);
  
    try {
      const formData = new FormData();
      formData.append('avatar_image', avatarImage);
      formData.append('clothing_image', clothingImage);
      
      // Add advanced options if provided
      if (tryOnOptions.avatarSex !== 'None') {
        formData.append('avatar_sex', tryOnOptions.avatarSex);
      }
      if (tryOnOptions.seed) {
        formData.append('seed', tryOnOptions.seed);
      }
      if (tryOnOptions.avatarPrompt) {
        formData.append('avatar_prompt', tryOnOptions.avatarPrompt);
      }
      if (tryOnOptions.clothingPrompt) {
        formData.append('clothing_prompt', tryOnOptions.clothingPrompt);
      }
      if (tryOnOptions.backgroundPrompt) {
        formData.append('background_prompt', tryOnOptions.backgroundPrompt);
      }
  
      console.log('Sending try-on request to:', `${TRYON_API_URL}/try-on`);
      const response = await fetch(`${TRYON_API_URL}/try-on`, {
        method: 'POST',
        body: formData,
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server responded with ${response.status}: ${errorText}`);
      }
  
      const contentType = response.headers.get('Content-Type');
      if (!contentType || !contentType.includes('image')) {
        const text = await response.text();
        throw new Error(`Expected an image, but received: ${text}`);
      }
  
      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('Received empty image from server');
      }
  
      const imageUrl = URL.createObjectURL(blob);
      setMessages(prev => [...prev, {
        text: "Here's your virtual try-on result:",
        sender: 'bot',
        tryOnResult: imageUrl
      }]);
  
      // Reset form
      setAvatarImage(null);
      setClothingImage(null);
      setAvatarPreview(null);
      setClothingPreview(null);
      setTryOnOptions({
        avatarSex: 'None',
        seed: '',
        avatarPrompt: '',
        clothingPrompt: '',
        backgroundPrompt: ''
      });
      setShowAdvancedOptions(false);
      
    } catch (error) {
      console.error('Try-on error:', error);
      setMessages(prev => [...prev, {
        text: `Sorry, I couldn't process your try-on request: ${error.message}`,
        sender: 'bot'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = (message, index) => {
    return (
      <div 
        key={index} 
        className={`message ${message.sender === 'user' ? 'user-message' : 'bot-message'}`}
      >
        <div className="message-content">
          <p>{message.text}</p>
          
          {message.serviceOptions && (
            <div className="service-options-in-chat">
              <button 
                className="service-button-in-chat recommendation-button" 
                onClick={() => selectService('recommendation')}
              >
                <div className="service-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 6H19V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 11L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M8 18H5V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 13L5 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M21 12C21 16.971 16.971 21 12 21C7.029 21 3 16.971 3 12C3 7.029 7.029 3 12 3C16.971 3 21 7.029 21 12Z" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </div>
                <div className="service-button-content">
                  <span>Outfit Recommendation</span>
                  <small>Find existing outfits from our catalog</small>
                </div>
              </button>
                
              <button 
                className="service-button-in-chat generation-button" 
                onClick={() => selectService('generation')}
              >
                <div className="service-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 4.5H18C19.1046 4.5 20 5.39543 20 6.5V9M9 4.5H6C4.89543 4.5 4 5.39543 4 6.5V9M4 16V18C4 19.1046 4.89543 20 6 20H8M15 20H18C19.1046 20 20 19.1046 20 18V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="service-button-content">
                  <span>Customized Outfit Generation</span>
                  <small>Create unique outfit visualizations with AI</small>
                </div>
              </button>

              <button 
                className="service-button-in-chat tryon-button" 
                onClick={() => selectService('tryon')}
              >
                <div className="service-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 8C13.1046 8 14 7.10457 14 6C14 4.89543 13.1046 4 12 4C10.8954 4 10 4.89543 10 6C10 7.10457 10.8954 8 12 8Z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M12 13V21M12 13C14.2091 13 16 11.2091 16 9C16 6.79086 14.2091 5 12 5C9.79086 5 8 6.79086 8 9C8 11.2091 9.79086 13 12 13Z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M8 17H16" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </div>
                <div className="service-button-content">
                  <span>Virtual Try-On</span>
                  <small>See how clothing looks on you</small>
                </div>
              </button>
            </div>
          )}
          
         {message.recommendations && message.recommendations.length > 0 && (
  <div className="recommendations-grid">
    {message.recommendations.map((item, idx) => (
      <div className="recommendation-card" key={idx}>
        <img
          src={item.image_url}
          alt={item.description}
          className="recommendation-image"
          onError={(e) => {
            e.target.src = 'https://via.placeholder.com/150?text=No+Image';
          }}
        />
        <div className="recommendation-details">
          <h4>Recommendation {idx + 1}</h4>
          <p>{item.description}</p>
        </div>
      </div>
    ))}
  </div>
)}
          
          {message.generatedImage && (
            <div className="generated-image-container">
              <img 
                src={message.generatedImage} 
                alt="Generated outfit" 
                className="generated-image"
                onError={(e) => {
                  console.error('Error loading generated image');
                  e.target.src = 'https://via.placeholder.com/300?text=Image+Failed+to+Load';
                }}
              />
            </div>
          )}

          {message.tryOnUpload && (
            <div className="tryon-upload-container">
              <div className="tryon-upload-row">
                <div className="tryon-upload-column">
                  <div className="image-upload-box">
                    <h4>Upload Avatar Image</h4>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => handleFileChange(e, 'avatar')} 
                      className="tryon-file-input"
                    />
                    {avatarPreview && (
                      <img 
                        src={avatarPreview} 
                        alt="Avatar Preview" 
                        className="tryon-preview-image" 
                      />
                    )}
                  </div>
                </div>
                <div className="tryon-upload-column">
                  <div className="image-upload-box">
                    <h4>Upload Clothing Image</h4>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => handleFileChange(e, 'clothing')} 
                      className="tryon-file-input"
                    />
                    {clothingPreview && (
                      <img 
                        src={clothingPreview} 
                        alt="Clothing Preview" 
                        className="tryon-preview-image" 
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="tryon-options-container">
                <button 
                  type="button" 
                  className="tryon-options-toggle"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                >
                  {showAdvancedOptions ? 'Hide' : 'Show'} Advanced Options
                </button>

                {showAdvancedOptions && (
                  <div className="tryon-advanced-options">
                    <div className="tryon-option-row">
                      <div className="tryon-option-column">
                        <label htmlFor="avatarSex">Avatar Sex</label>
                        <select 
                          name="avatarSex" 
                          value={tryOnOptions.avatarSex} 
                          onChange={handleTryOnOptionChange}
                          className="tryon-select"
                        >
                          <option value="None">Not Specified</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </div>
                      <div className="tryon-option-column">
                        <label htmlFor="seed">Seed Value</label>
                        <input 
                          type="text" 
                          name="seed" 
                          value={tryOnOptions.seed} 
                          onChange={handleTryOnOptionChange}
                          placeholder="-1 for random"
                          className="tryon-input"
                        />
                      </div>
                    </div>

                    <div className="tryon-option-row">
                      <div className="tryon-option-column">
                        <label htmlFor="avatarPrompt">Avatar Prompt</label>
                        <input 
                          type="text" 
                          name="avatarPrompt" 
                          value={tryOnOptions.avatarPrompt} 
                          onChange={handleTryOnOptionChange}
                          placeholder="Optional avatar description"
                          className="tryon-input"
                        />
                      </div>
                      <div className="tryon-option-column">
                        <label htmlFor="clothingPrompt">Clothing Prompt</label>
                        <input 
                          type="text" 
                          name="clothingPrompt" 
                          value={tryOnOptions.clothingPrompt} 
                          onChange={handleTryOnOptionChange}
                          placeholder="Optional clothing description"
                          className="tryon-input"
                        />
                      </div>
                    </div>

                    <div className="tryon-option-row">
                      <div className="tryon-option-column full-width">
                        <label htmlFor="backgroundPrompt">Background Prompt</label>
                        <input 
                          type="text" 
                          name="backgroundPrompt" 
                          value={tryOnOptions.backgroundPrompt} 
                          onChange={handleTryOnOptionChange}
                          placeholder="Optional background description"
                          className="tryon-input"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <button 
                  type="button" 
                  className="tryon-submit-button"
                  onClick={handleTryOnSubmit}
                  disabled={!avatarImage || !clothingImage || isLoading}
                >
                  {isLoading ? 'Processing...' : 'Generate Try-On'}
                </button>
              </div>
            </div>
          )}

          {message.tryOnResult && (
            <div className="tryon-result-container">
              <img 
                src={message.tryOnResult} 
                alt="Virtual Try-On Result" 
                className="tryon-result-image"
                onError={(e) => {
                  console.error('Failed to load try-on result image');
                  e.target.src = 'https://via.placeholder.com/300?text=Try-On+Result+Failed+to+Load';
                }}
              />
              <div className="tryon-result-actions">
                <a 
                  href={message.tryOnResult} 
                  download="virtual-tryon-result.jpg"
                  className="tryon-download-button"
                >
                  Download Image
                </a>
                <button 
                  type="button" 
                  className="tryon-try-again-button"
                  onClick={() => selectService('tryon')}
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const toggleChat = () => {
    setShowChat(!showChat);
    if (!showChat) {
      setActiveService(null);
      setMessages([
        { text: "Hello! I'm your fashion assistant. Choose an option below to get started!", sender: 'bot' },
        renderServiceOptions()
      ]);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Personalized Fashion Recommendation</h1>
        <p>Your AI-powered fashion assistant</p>
      </header>
      
      {!showChat ? (
        <div className="home-container">
          <div className="home-content">
            <h2>Welcome to Your Fashion Assistant</h2>
            <div className="features">
              <div className="feature-card">
                <div className="feature-icon recommendation-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 6H16V4C16 2.89 15.11 2 14 2H10C8.89 2 8 2.89 8 4V6H4C2.89 6 2 6.89 2 8V19C2 20.11 2.89 21 4 21H20C21.11 21 22 20.11 22 19V8C22 6.89 21.11 6 20 6ZM10 4H14V6H10V4ZM20 19H4V8H20V19Z" fill="currentColor"/>
                    <path d="M12 9C9.79 9 8 10.79 8 13C8 15.21 9.79 17 12 17C14.21 17 16 15.21 16 13C16 10.79 14.21 9 12 9Z" fill="currentColor"/>
                  </svg>
                </div>
                <h3>Outfit Recommendation</h3>
                <p>Find existing outfit combinations from our catalog</p>
                <div className="feature-example">
                  Example: "Red shirt paired with jeans"
                </div>
              </div>
              <div className="feature-card">
                <div className="feature-icon generation-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 4.5H18C19.1046 4.5 20 5.39543 20 6.5V9M9 4.5H6C4.89543 4.5 4 5.39543 4 6.5V9M4 16V18C4 19.1046 4.89543 20 6 20H8M15 20H18C19.1046 20 20 19.1046 20 18V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <h3>Customized Outfit Generation</h3>
                <p>Create unique outfit visualizations from your description</p>
                <div className="feature-example">
                  Example: "Pink Frock with puff sleeves and white stripes"
                </div>
              </div>
              <div className="feature-card">
                <div className="feature-icon tryon-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 8C13.1046 8 14 7.10457 14 6C14 4.89543 13.1046 4 12 4C10.8954 4 10 4.89543 10 6C10 7.10457 10.8954 8 12 8Z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M12 13V21M12 13C14.2091 13 16 11.2091 16 9C16 6.79086 14.2091 5 12 5C9.79086 5 8 6.79086 8 9C8 11.2091 9.79086 13 12 13Z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M8 17H16" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </div>
                <h3>Virtual Try-On</h3>
                <p>See how clothing looks on you</p>
                <div className="feature-example">
                  Upload your photo and try on different outfits
                </div>
              </div>
            </div>
            <div className="chatbot-launcher-container">
              <button className="chatbot-launcher" onClick={toggleChat}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H6L4 18V4H20V16Z" fill="currentColor"/>
                  <circle cx="8" cy="10" r="1.5" fill="currentColor"/>
                  <circle cx="12" cy="10" r="1.5" fill="currentColor"/>
                  <circle cx="16" cy="10" r="1.5" fill="currentColor"/>
                </svg>
                <span>Chat with Fashion Assistant</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="chat-container">
          <div className="chat-header">
            <h2>Fashion Assistant</h2>
            <button className="close-chat" onClick={toggleChat}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <div className="messages-container">
            {messages.map(renderMessage)}
            {isLoading && (
              <div className="message bot-message">
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {activeService && (
            <div className="active-service-indicator">
              <div className="active-service-info">
                <div className="active-service-icon">
                  {activeService === 'recommendation' ? (
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M16 6H19V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M14 11L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : activeService === 'generation' ? (
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 8C13.1046 8 14 7.10457 14 6C14 4.89543 13.1046 4 12 4C10.8954 4 10 4.89543 10 6C10 7.10457 10.8954 8 12 8Z" stroke="currentColor" strokeWidth="2"/>
                      <path d="M12 13V21M12 13C14.2091 13 16 11.2091 16 9C16 6.79086 14.2091 5 12 5 C9.79086 5 8 6.79086 8 9C8 11.2091 9.79086 13 12 13Z" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                  )}
                </div>
                <span className="active-service-label">
                  {activeService === 'recommendation' 
                    ? 'Outfit Recommendation' 
                    : activeService === 'generation'
                      ? 'Outfit Generation'
                      : 'Virtual Try-On'}
                </span>
              </div>
              <button 
                className="change-service-button"
                onClick={() => {
                  setActiveService(null);
                  setMessages(prev => [...prev, renderServiceOptions()]);
                }}
              >
                Change
              </button>
            </div>
          )}
          
          <form className="input-container" onSubmit={handleSubmit}>
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder={activeService === 'tryon' ? "Upload images above" : "Type your message..."}
              disabled={activeService === 'tryon' || !activeService || isLoading}
            />
            <button type="submit" disabled={!inputValue.trim() && activeService !== 'tryon' || isLoading}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" fill="currentColor"/>
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
