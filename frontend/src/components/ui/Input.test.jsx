import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input, Textarea, Select } from './Input'

describe('Input Component', () => {
  describe('Basic Rendering', () => {
    it('renders input element', () => {
      render(<Input />)
      const input = screen.getByRole('textbox')
      expect(input).toBeInTheDocument()
    })

    it('renders with placeholder text', () => {
      render(<Input placeholder="Enter your name" />)
      expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument()
    })

    it('renders with value', () => {
      render(<Input value="Test Value" onChange={vi.fn()} />)
      expect(screen.getByRole('textbox')).toHaveValue('Test Value')
    })

    it('has text type by default', () => {
      render(<Input />)
      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'text')
    })
  })

  describe('Input Types', () => {
    it('renders email input type', () => {
      render(<Input type="email" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('type', 'email')
    })

    it('renders password input type', () => {
      const { container } = render(<Input type="password" />)
      const input = container.querySelector('input[type="password"]')
      expect(input).toBeInTheDocument()
    })

    it('renders number input type', () => {
      render(<Input type="number" />)
      const input = screen.getByRole('spinbutton')
      expect(input).toHaveAttribute('type', 'number')
    })
  })

  describe('User Interactions', () => {
    it('calls onChange when user types', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(<Input onChange={handleChange} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'Hello')

      expect(handleChange).toHaveBeenCalled()
    })

    it('updates value on change', async () => {
      const user = userEvent.setup()

      const TestComponent = () => {
        const [value, setValue] = React.useState('')
        return <Input value={value} onChange={(e) => setValue(e.target.value)} />
      }

      render(<TestComponent />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'Test')

      expect(input).toHaveValue('Test')
    })
  })

  describe('States', () => {
    it('is disabled when disabled prop is true', () => {
      render(<Input disabled />)
      expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('has disabled styling when disabled', () => {
      const { container } = render(<Input disabled />)
      const input = container.querySelector('input')
      expect(input).toHaveClass('bg-gray-100', 'cursor-not-allowed')
    })

    it('is required when required prop is true', () => {
      render(<Input required />)
      expect(screen.getByRole('textbox')).toBeRequired()
    })

    it('is not required by default', () => {
      render(<Input />)
      expect(screen.getByRole('textbox')).not.toBeRequired()
    })
  })

  describe('Error State', () => {
    it('shows error message when error is true', () => {
      render(<Input error errorMessage="This field is required" />)
      expect(screen.getByText('This field is required')).toBeInTheDocument()
    })

    it('does not show error message when error is false', () => {
      render(<Input error={false} errorMessage="This field is required" />)
      expect(screen.queryByText('This field is required')).not.toBeInTheDocument()
    })

    it('does not show error message when errorMessage is not provided', () => {
      const { container } = render(<Input error />)
      const errorText = container.querySelector('.text-red-600')
      expect(errorText).not.toBeInTheDocument()
    })

    it('has error styling when error is true', () => {
      const { container } = render(<Input error />)
      const input = container.querySelector('input')
      expect(input).toHaveClass('border-red-300', 'focus:ring-red-500')
    })

    it('has normal styling when error is false', () => {
      const { container } = render(<Input error={false} />)
      const input = container.querySelector('input')
      expect(input).toHaveClass('border-gray-300', 'focus:ring-optio-purple')
    })
  })

  describe('Ref Forwarding', () => {
    it('forwards ref to input element', () => {
      const ref = React.createRef()
      render(<Input ref={ref} />)
      expect(ref.current).toBeInstanceOf(HTMLInputElement)
    })

    it('can focus input using ref', () => {
      const ref = React.createRef()
      render(<Input ref={ref} />)
      ref.current.focus()
      expect(ref.current).toHaveFocus()
    })
  })

  describe('Custom Classes', () => {
    it('applies custom className', () => {
      const { container } = render(<Input className="custom-input" />)
      const input = container.querySelector('input')
      expect(input).toHaveClass('custom-input')
    })

    it('preserves default classes with custom className', () => {
      const { container } = render(<Input className="text-lg" />)
      const input = container.querySelector('input')
      expect(input).toHaveClass('text-lg', 'w-full', 'px-3', 'py-2')
    })
  })

  describe('Additional Props', () => {
    it('passes through additional HTML attributes', () => {
      render(<Input data-testid="custom-input" aria-label="Custom Input" />)
      const input = screen.getByTestId('custom-input')
      expect(input).toHaveAttribute('aria-label', 'Custom Input')
    })

    it('supports autocomplete attribute', () => {
      render(<Input autoComplete="email" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('autocomplete', 'email')
    })

    it('supports name attribute', () => {
      render(<Input name="username" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('name', 'username')
    })
  })
})

describe('Textarea Component', () => {
  describe('Basic Rendering', () => {
    it('renders textarea element', () => {
      render(<Textarea />)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('renders with placeholder text', () => {
      render(<Textarea placeholder="Enter your message" />)
      expect(screen.getByPlaceholderText('Enter your message')).toBeInTheDocument()
    })

    it('renders with value', () => {
      render(<Textarea value="Message content" onChange={vi.fn()} />)
      expect(screen.getByRole('textbox')).toHaveValue('Message content')
    })

    it('has 4 rows by default', () => {
      render(<Textarea />)
      expect(screen.getByRole('textbox')).toHaveAttribute('rows', '4')
    })

    it('renders with custom rows', () => {
      render(<Textarea rows={10} />)
      expect(screen.getByRole('textbox')).toHaveAttribute('rows', '10')
    })
  })

  describe('User Interactions', () => {
    it('calls onChange when user types', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(<Textarea onChange={handleChange} />)

      const textarea = screen.getByRole('textbox')
      await user.type(textarea, 'Hello')

      expect(handleChange).toHaveBeenCalled()
    })

    it('handles multiline text', async () => {
      const user = userEvent.setup()

      const TestComponent = () => {
        const [value, setValue] = React.useState('')
        return <Textarea value={value} onChange={(e) => setValue(e.target.value)} />
      }

      render(<TestComponent />)

      const textarea = screen.getByRole('textbox')
      await user.type(textarea, 'Line 1{Enter}Line 2')

      expect(textarea).toHaveValue('Line 1\nLine 2')
    })
  })

  describe('States', () => {
    it('is disabled when disabled prop is true', () => {
      render(<Textarea disabled />)
      expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('is required when required prop is true', () => {
      render(<Textarea required />)
      expect(screen.getByRole('textbox')).toBeRequired()
    })

    it('has resize-vertical class', () => {
      const { container } = render(<Textarea />)
      const textarea = container.querySelector('textarea')
      expect(textarea).toHaveClass('resize-vertical')
    })
  })

  describe('Error State', () => {
    it('shows error message when error is true', () => {
      render(<Textarea error errorMessage="Message is required" />)
      expect(screen.getByText('Message is required')).toBeInTheDocument()
    })

    it('has error styling when error is true', () => {
      const { container } = render(<Textarea error />)
      const textarea = container.querySelector('textarea')
      expect(textarea).toHaveClass('border-red-300')
    })
  })

  describe('Ref Forwarding', () => {
    it('forwards ref to textarea element', () => {
      const ref = React.createRef()
      render(<Textarea ref={ref} />)
      expect(ref.current).toBeInstanceOf(HTMLTextAreaElement)
    })
  })
})

describe('Select Component', () => {
  const mockOptions = [
    { value: '1', label: 'Option 1' },
    { value: '2', label: 'Option 2' },
    { value: '3', label: 'Option 3' }
  ]

  describe('Basic Rendering', () => {
    it('renders select element', () => {
      render(<Select options={mockOptions} />)
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('renders placeholder option', () => {
      render(<Select options={mockOptions} placeholder="Choose an option" />)
      expect(screen.getByText('Choose an option')).toBeInTheDocument()
    })

    it('renders all options from options array', () => {
      render(<Select options={mockOptions} />)
      expect(screen.getByText('Option 1')).toBeInTheDocument()
      expect(screen.getByText('Option 2')).toBeInTheDocument()
      expect(screen.getByText('Option 3')).toBeInTheDocument()
    })

    it('placeholder option is disabled', () => {
      render(<Select options={mockOptions} placeholder="Choose" />)
      const placeholderOption = screen.getByText('Choose')
      expect(placeholderOption).toHaveAttribute('disabled')
    })

    it('placeholder option has empty value', () => {
      render(<Select options={mockOptions} placeholder="Choose" />)
      const placeholderOption = screen.getByText('Choose')
      expect(placeholderOption).toHaveAttribute('value', '')
    })
  })

  describe('Options Rendering', () => {
    it('renders options with correct values', () => {
      const { container } = render(<Select options={mockOptions} />)
      const option1 = container.querySelector('option[value="1"]')
      const option2 = container.querySelector('option[value="2"]')

      expect(option1).toBeInTheDocument()
      expect(option2).toBeInTheDocument()
    })

    it('renders custom children instead of options array', () => {
      render(
        <Select>
          <option value="custom1">Custom 1</option>
          <option value="custom2">Custom 2</option>
        </Select>
      )

      expect(screen.getByText('Custom 1')).toBeInTheDocument()
      expect(screen.getByText('Custom 2')).toBeInTheDocument()
    })

    it('handles empty options array', () => {
      render(<Select options={[]} placeholder="No options" />)
      expect(screen.getByRole('combobox')).toBeInTheDocument()
      expect(screen.getByText('No options')).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('calls onChange when user selects an option', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(<Select options={mockOptions} onChange={handleChange} />)

      const select = screen.getByRole('combobox')
      await user.selectOptions(select, '2')

      expect(handleChange).toHaveBeenCalled()
    })

    it('updates value on change', async () => {
      const user = userEvent.setup()

      const TestComponent = () => {
        const [value, setValue] = React.useState('')
        return <Select options={mockOptions} value={value} onChange={(e) => setValue(e.target.value)} />
      }

      render(<TestComponent />)

      const select = screen.getByRole('combobox')
      await user.selectOptions(select, '2')

      expect(select).toHaveValue('2')
    })
  })

  describe('States', () => {
    it('is disabled when disabled prop is true', () => {
      render(<Select options={mockOptions} disabled />)
      expect(screen.getByRole('combobox')).toBeDisabled()
    })

    it('is required when required prop is true', () => {
      render(<Select options={mockOptions} required />)
      expect(screen.getByRole('combobox')).toBeRequired()
    })

    it('has disabled styling when disabled', () => {
      const { container } = render(<Select options={mockOptions} disabled />)
      const select = container.querySelector('select')
      expect(select).toHaveClass('bg-gray-100', 'cursor-not-allowed')
    })
  })

  describe('Error State', () => {
    it('shows error message when error is true', () => {
      render(<Select options={mockOptions} error errorMessage="Please select an option" />)
      expect(screen.getByText('Please select an option')).toBeInTheDocument()
    })

    it('has error styling when error is true', () => {
      const { container } = render(<Select options={mockOptions} error />)
      const select = container.querySelector('select')
      expect(select).toHaveClass('border-red-300')
    })
  })

  describe('Ref Forwarding', () => {
    it('forwards ref to select element', () => {
      const ref = React.createRef()
      render(<Select ref={ref} options={mockOptions} />)
      expect(ref.current).toBeInstanceOf(HTMLSelectElement)
    })
  })

  describe('Custom Classes', () => {
    it('applies custom className', () => {
      const { container } = render(<Select options={mockOptions} className="custom-select" />)
      const select = container.querySelector('select')
      expect(select).toHaveClass('custom-select')
    })
  })
})

// Import React for useState in tests
import React from 'react'
