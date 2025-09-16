// src/ToggleSwitch.jsx

import React from 'react';
import { motion } from 'framer-motion'; // Importa o 'motion'
import './ToggleSwitch.css';

function ToggleSwitch({ options, selectedValue, onChange }) {
  return (
    <div className="toggle-container">
      {options.map((option) => (
        <button
          key={option.value}
          className={`toggle-option ${selectedValue === option.value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {/* O "glider" agora é um motion.div que vive DENTRO da opção ativa */}
          {selectedValue === option.value && (
            <motion.div
              className="toggle-glider"
              layoutId="glider" // A mágica acontece aqui!
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            />
          )}
          <span className="toggle-label">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export default ToggleSwitch;