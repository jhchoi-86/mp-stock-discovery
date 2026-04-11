import { useSSE as useSSEContext } from '../context/SSEContext';

export const useSSE = () => {
    return useSSEContext();
};
