// src/NumberInput.jsx

import React, { useState, useEffect, useRef } from 'react';
import CountUp from 'react-countup'; // Importa o componente da nova biblioteca

// Hook customizado para "lembrar" do valor anterior de uma prop
function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

function NumberInput({ value, onChange, min = 0.5, step = 0.5 }) {
  // Usa nosso hook para saber qual era o valor antes da mudança
  const prevValue = usePrevious(value);

  const handleDecrement = () => {
    const newValue = Math.max(min, value - step);
    onChange(newValue);
  };

  const handleIncrement = () => {
    const newValue = value + step;
    onChange(newValue);
  };

  return (
    <div className="custom-number-input">
      <button onClick={handleDecrement}>-</button>
      <span>
        <CountUp
          start={prevValue || 0} // Começa do valor anterior
          end={value}             // Anima até o valor atual
          duration={0.4}          // Duração da animação em segundos
          decimals={1}            // Mostra uma casa decimal (para o .5)
          decimal=","             // Usa vírgula como separador decimal
        />
      </span>
      <button onClick={handleIncrement}>+</button>
    </div>
  );
}

export default NumberInput;